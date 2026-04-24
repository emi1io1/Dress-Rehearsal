import type { CriticalMoment, Curveball, GapAnalysis, Outcome, RunType, Scenario } from "@rehearsal/types";
import { DEFAULT_MODEL, getAnthropicClient } from "./claude";
import { buildFederatedBlock, buildGroundingBlock } from "./prompt-blocks";
import {
  extractJson,
  firstTextBlock,
  normalizeCurveballs,
  normalizeGapAnalysis,
  normalizeOutcome,
  pickHighestRiskCurveball,
} from "./parse";

/**
 * Archetype metadata declared by each Guild agent. Identity + scoping
 * info that gets persisted on every simulation_run + agent_run row, so
 * the audit trail attributes behavior to a specific versioned persona.
 */
export type ArchetypeMetadata = {
  archetypeId: string;
  displayName: string;           // e.g. "Technical Skeptic"
  title: string;                 // e.g. "Staff Engineer"
  description: string;           // one-sentence persona
  pressureStyle: string;         // one-sentence difficulty
  specialty: string;             // what this archetype probes
  scopedSubgraphs: readonly string[]; // which Cosmo subgraphs this persona may read
  version: string;               // semver, bumped when prompt/tool changes
  guildAgentId: string | null;   // populated by registry.json after publish
};

export type RunProfileCopy = {
  label: string;
  tone: string;
};

export const RUN_PROFILE_COPY: Record<RunType, RunProfileCopy> = {
  best: {
    label: "Best case",
    tone: "Interviewer is receptive and generous. Candidate benefits from favorable framing.",
  },
  likely: {
    label: "Likely case",
    tone: "Interviewer is professional and fair but probing. Candidate must earn each yes.",
  },
  worst: {
    label: "Worst case",
    tone: "Interviewer is skeptical, aggressive, time-pressured. Candidate must handle pushback on gaps and comp.",
  },
};

export type AgentInput = {
  scenario: Scenario;
  runType: RunType;
};

export type AgentOutput = {
  curveballs: Curveball[];
  gapAnalysis: GapAnalysis;
  criticalMoment: CriticalMoment | null;
  outcome: Outcome;
};

export type ArchetypeAgent = {
  metadata: ArchetypeMetadata;
  run: (input: AgentInput) => Promise<AgentOutput>;
};

/**
 * Two-pass simulation bound to a single archetype. Every Guild-registered
 * persona agent calls this with its own metadata — the prompt inherits the
 * persona's description, pressure style, and scoped specialty, so TWO calls
 * to this function with different metadata produce meaningfully different
 * interview behavior.
 */
export async function simulateArchetype(
  metadata: ArchetypeMetadata,
  input: AgentInput,
): Promise<AgentOutput> {
  const analysis = await runAnalysisPass(metadata, input);
  const topRisk = pickHighestRiskCurveball(analysis.curveballs);
  const criticalMoment = topRisk
    ? await runCriticalMomentPass(metadata, input, topRisk)
    : null;
  return {
    curveballs: analysis.curveballs,
    gapAnalysis: analysis.gapAnalysis,
    criticalMoment,
    outcome: analysis.outcome,
  };
}

// ---------- analysis pass ----------

async function runAnalysisPass(
  metadata: ArchetypeMetadata,
  input: AgentInput,
): Promise<{ curveballs: Curveball[]; gapAnalysis: GapAnalysis; outcome: Outcome }> {
  const { scenario, runType } = input;
  const profile = RUN_PROFILE_COPY[runType];
  const client = getAnthropicClient();

  const system = [
    "You are an elite interview coach simulating how a real hiring process would play out.",
    "Your job is to surface REAL preparation gaps — not to impress anyone with a nice transcript.",
    "You will play the role of an interviewer generating likely questions, then assess the candidate's preparedness against their STATED CONTEXT ONLY.",
    "NEVER invent facts about the candidate that aren't in their stated context. Missing info is a GAP, not something to smooth over.",
    "Return STRICTLY valid JSON — no markdown, no code fences, no commentary.",
  ].join(" ");

  const groundingBlock = buildGroundingBlock(scenario);
  const federatedBlock = buildFederatedBlock(scenario);

  const user = [
    `# Interviewer persona`,
    `Archetype: ${metadata.displayName} (${metadata.title})`,
    `Style: ${metadata.description}`,
    `Pressure: ${metadata.pressureStyle}`,
    `Specialty: ${metadata.specialty}`,
    `Run profile: ${profile.label} — ${profile.tone}`,
    ``,
    `# The role`,
    `Title: ${scenario.context.jobTitle}`,
    `Company: ${scenario.context.company}`,
    `JD:`,
    scenario.context.jobDescription,
    ``,
    federatedBlock,
    groundingBlock,
    `# Candidate's stated context (this is ALL you know about them)`,
    `Skills/background:`,
    scenario.context.userSkills,
    scenario.context.salaryExpectation
      ? `Salary target: ${scenario.context.salaryExpectation}`
      : ``,
    scenario.context.otherContext ? `Other context:\n${scenario.context.otherContext}` : ``,
    ``,
    `# Candidate's goals`,
    ...scenario.userGoals.map((g) => `- ${g}`),
    ``,
    `# Task`,
    `Return JSON with this exact shape:`,
    `{`,
    `  "curveballs": [`,
    `    {`,
    `      "question": "<the actual interview question, quoted>",`,
    `      "reason": "<2-3 sentences: why THIS interviewer at THIS company for THIS role would ask it>",`,
    `      "category": "<one of: resume_gap | role_requirement | company_specific | values_probe | technical_depth>",`,
    `      "risk": "<HIGH | MEDIUM | LOW — HIGH if the candidate's stated context does NOT contain a strong answer; MEDIUM if partial; LOW if well-covered>"`,
    `    }`,
    `    // 5 to 8 entries`,
    `  ],`,
    `  "gapAnalysis": {`,
    `    "unaddressed": [ "<bullet>", ... ],`,
    `    "weak": [ "<bullet>", ... ],`,
    `    "strong": [ "<bullet>", ... ]`,
    `  },`,
    `  "outcome": {`,
    `    "goalAchievement": [ { "goal": "<quoted from candidate's goals>", "result": "<achieved | partial | missed>" }, ... ],`,
    `    "salaryOutcome": "<string describing likely salary outcome, or null if no salary target>",`,
    `    "roleFit": "<strong | mixed | weak>",`,
    `    "summary": "<2-3 sentence bottom line>"`,
    `  }`,
    `}`,
    ``,
    `Rules:`,
    `- Generate 5-8 curveballs spanning multiple categories. Lean into your specialty: ${metadata.specialty}.`,
    `- Risk ratings must reflect ONLY what's in the stated context — don't assume competencies the candidate didn't claim.`,
    `- Gap analysis bullets should be concrete and actionable.`,
    `- For a best-case run, bias favorable but stay grounded; for worst-case, bias is unfavorable and honest about it.`,
    scenario.grounding
      ? `- At least ONE curveball MUST be a "company_specific" question that references the grounded context.`
      : ``,
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: user }],
  });

  const parsed = extractJson(firstTextBlock(resp));
  return {
    curveballs: normalizeCurveballs(parsed.curveballs),
    gapAnalysis: normalizeGapAnalysis(parsed.gapAnalysis),
    outcome: normalizeOutcome(parsed.outcome, scenario.userGoals),
  };
}

// ---------- critical moment pass ----------

async function runCriticalMomentPass(
  metadata: ArchetypeMetadata,
  input: AgentInput,
  curveball: Curveball,
): Promise<CriticalMoment> {
  const { scenario } = input;
  const client = getAnthropicClient();

  const system = [
    "You simulate a single pivotal exchange in a job interview — 3-5 short lines total, interviewer + candidate.",
    "CRITICAL: you are playing TWO roles. The interviewer pushes on the question. The candidate (user-proxy) may only use facts present in the STATED CONTEXT. If the context does not cover what's being asked, the candidate MUST say something honest and hedging — 'I haven't worked with that specifically', 'I'm not sure', 'I don't have a great example for that' — NEVER invent experience.",
    "Return STRICTLY valid JSON — no markdown, no code fences.",
  ].join(" ");

  const user = [
    `# The question being pressed`,
    `"${curveball.question}"`,
    `Category: ${curveball.category} · Risk: ${curveball.risk}`,
    `Why asked: ${curveball.reason}`,
    ``,
    `# Interviewer (${metadata.displayName})`,
    metadata.description,
    metadata.pressureStyle,
    ``,
    `# Candidate's stated context (this is ALL you can use)`,
    scenario.context.userSkills,
    scenario.context.otherContext ? `\nOther context: ${scenario.context.otherContext}` : ``,
    ``,
    `# Task`,
    `Return JSON:`,
    `{`,
    `  "interviewerLine": "<one line, 1-3 sentences — the interviewer pressing on this question in-character>",`,
    `  "userProxyLine": "<one line, 1-3 sentences — the candidate's honest response given ONLY what's in stated context>",`,
    `  "handled": <true if the stated context clearly addresses the question, false if not>,`,
    `  "failureMode": "<if handled is false: 1 sentence describing exactly what gap just surfaced. If handled is true, null.>"`,
    `}`,
    ``,
    `Do NOT let the candidate invent facts. If they can't answer from stated context, make that visible.`,
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 500,
    system,
    messages: [{ role: "user", content: user }],
  });

  const parsed = extractJson(firstTextBlock(resp));
  return {
    curveballId: curveball.id,
    interviewerLine: String(parsed.interviewerLine ?? "").trim(),
    userProxyLine: String(parsed.userProxyLine ?? "").trim(),
    handled: parsed.handled === true,
    failureMode:
      parsed.handled === true
        ? null
        : parsed.failureMode
          ? String(parsed.failureMode).trim()
          : "Your stated context does not cover this.",
  };
}
