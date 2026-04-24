import { randomUUID } from "node:crypto";
import { DEFAULT_MODEL, getAnthropicClient } from "./claude";
import {
  archetypeForRunType,
  ARCHETYPES,
  RUN_PROFILE,
  type PersonaArchetype,
} from "./personas";
import type {
  CriticalMoment,
  Curveball,
  GapAnalysis,
  Outcome,
  RunType,
  Scenario,
} from "@rehearsal/types";

type RunSimulationInput = {
  scenario: Scenario;
  runType: RunType;
  archetypeId?: string;
};

type RunSimulationResult = {
  archetype: PersonaArchetype;
  curveballs: Curveball[];
  gapAnalysis: GapAnalysis;
  criticalMoment: CriticalMoment | null;
  outcome: Outcome;
};

/**
 * A structured simulation: two Claude calls.
 *   1. Analysis pass — curveballs + gap analysis + outcome prediction.
 *   2. Critical-moment pass — a 3-5 line exchange on the highest-risk
 *      curveball. The user-proxy is CONSTRAINED: it may only use
 *      information the user actually provided in their context. If the
 *      context doesn't cover the question, the proxy hedges ("I'm not
 *      sure", "I haven't worked with that") and the system flags a
 *      failure mode.
 *
 * This replaces the old turn-by-turn chat simulator, which rewarded
 * Claude's improvisation rather than surfacing real prep gaps.
 */
export async function runSimulation(input: RunSimulationInput): Promise<RunSimulationResult> {
  const { scenario, runType, archetypeId } = input;
  const archetype = archetypeId
    ? (ARCHETYPES[archetypeId] ?? archetypeForRunType(runType))
    : archetypeForRunType(runType);

  const analysis = await runAnalysisPass(scenario, runType, archetype);
  const topRisk = pickHighestRiskCurveball(analysis.curveballs);
  const criticalMoment = topRisk
    ? await runCriticalMomentPass(scenario, runType, archetype, topRisk)
    : null;

  return {
    archetype,
    curveballs: analysis.curveballs,
    gapAnalysis: analysis.gapAnalysis,
    criticalMoment,
    outcome: analysis.outcome,
  };
}

export type AnalysisPassResult = {
  archetype: PersonaArchetype;
  curveballs: Curveball[];
  gapAnalysis: GapAnalysis;
  outcome: Outcome;
};

/**
 * Stage 1 of a simulation. Exposed so callers can stream partial results
 * (curveballs/gap/outcome) to the UI before the critical moment finishes.
 */
export async function runAnalysisOnly(input: RunSimulationInput): Promise<AnalysisPassResult> {
  const { scenario, runType, archetypeId } = input;
  const archetype = archetypeId
    ? (ARCHETYPES[archetypeId] ?? archetypeForRunType(runType))
    : archetypeForRunType(runType);
  const analysis = await runAnalysisPass(scenario, runType, archetype);
  return { archetype, ...analysis };
}

/**
 * Stage 2 of a simulation. Takes the curveballs from stage 1 and
 * generates the critical-moment exchange.
 */
export async function runCriticalMomentOnly(input: {
  scenario: Scenario;
  runType: RunType;
  archetype: PersonaArchetype;
  curveballs: Curveball[];
}): Promise<CriticalMoment | null> {
  const top = pickHighestRiskCurveball(input.curveballs);
  if (!top) return null;
  return runCriticalMomentPass(input.scenario, input.runType, input.archetype, top);
}

// ---------- analysis pass ----------

type AnalysisResult = {
  curveballs: Curveball[];
  gapAnalysis: GapAnalysis;
  outcome: Outcome;
};

async function runAnalysisPass(
  scenario: Scenario,
  runType: RunType,
  archetype: PersonaArchetype,
): Promise<AnalysisResult> {
  const client = getAnthropicClient();
  const profile = RUN_PROFILE[runType];

  const system = [
    "You are an elite interview coach simulating how a real hiring process would play out.",
    "Your job is to surface REAL preparation gaps — not to impress anyone with a nice transcript.",
    "You will play the role of an interviewer generating likely questions, then assess the candidate's preparedness against their STATED CONTEXT ONLY.",
    "NEVER invent facts about the candidate that aren't in their stated context. Missing info is a GAP, not something to smooth over.",
    "Return STRICTLY valid JSON — no markdown, no code fences, no commentary.",
  ].join(" ");

  const groundingBlock = buildGroundingBlock(scenario);

  const user = [
    `# Interviewer persona`,
    `Archetype: ${archetype.name} (${archetype.title})`,
    `Style: ${archetype.description}`,
    `Pressure: ${archetype.pressureStyle}`,
    `Run profile: ${profile.label} — ${profile.tone}`,
    ``,
    `# The role`,
    `Title: ${scenario.context.jobTitle}`,
    `Company: ${scenario.context.company}`,
    `JD:`,
    scenario.context.jobDescription,
    ``,
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
    `    "unaddressed": [ "<bullet: question/topic the stated context leaves completely blank>", ... ],`,
    `    "weak": [ "<bullet: area where context exists but is thin, e.g. a number without justification>", ... ],`,
    `    "strong": [ "<bullet: area where context is specific and defensible>", ... ]`,
    `  },`,
    `  "outcome": {`,
    `    "goalAchievement": [`,
    `      { "goal": "<quoted from candidate's goals>", "result": "<achieved | partial | missed>" },`,
    `      ... one entry per goal`,
    `    ],`,
    `    "salaryOutcome": "<string describing likely salary outcome, or null if no salary target>",`,
    `    "roleFit": "<strong | mixed | weak>",`,
    `    "summary": "<2-3 sentence bottom line: would this candidate land this role in this run? why/why not?>"`,
    `  }`,
    `}`,
    ``,
    `Rules:`,
    `- Generate 5-8 curveballs spanning multiple categories.`,
    `- Risk ratings must reflect ONLY what's in the stated context — don't assume competencies the candidate didn't claim.`,
    `- Gap analysis bullets should be concrete and actionable ("no mention of on-call rotation experience" > "leadership skills unclear").`,
    `- For a best-case run, the outcome bias is favorable but still grounded; for worst-case, bias is unfavorable and honest about it.`,
    scenario.grounding
      ? `- At least ONE curveball MUST be a "company_specific" question that references the grounded context (recent news, culture signals, or known interview focus).`
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

  const text = firstTextBlock(resp);
  const parsed = extractJson(text);

  const curveballs = normalizeCurveballs(parsed.curveballs);
  const gapAnalysis = normalizeGapAnalysis(parsed.gapAnalysis);
  const outcome = normalizeOutcome(parsed.outcome, scenario.userGoals);

  return { curveballs, gapAnalysis, outcome };
}

// ---------- critical moment pass ----------

async function runCriticalMomentPass(
  scenario: Scenario,
  runType: RunType,
  archetype: PersonaArchetype,
  curveball: Curveball,
): Promise<CriticalMoment> {
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
    `# Interviewer (${archetype.name})`,
    archetype.description,
    archetype.pressureStyle,
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
    `  "failureMode": "<if handled is false: 1 sentence describing exactly what gap just surfaced (e.g. 'Your context does not mention distributed consensus protocols'). If handled is true, null.>"`,
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

  const text = firstTextBlock(resp);
  const parsed = extractJson(text);

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

// ---------- helpers ----------

function buildGroundingBlock(scenario: Scenario): string {
  const g = scenario.grounding;
  if (!g) return "";
  const section = (title: string, items: string[]): string | null => {
    const trimmed = items.filter(Boolean).slice(0, 4);
    if (trimmed.length === 0) return null;
    return `${title}:\n${trimmed.map((i) => `- ${i}`).join("\n")}`;
  };
  const parts = [
    section("Recent moves", g.newsItems),
    section("Culture / interview style", g.cultureSignals),
    section("Recent events", g.recentEvents),
    section("Topics this company's interviews probe", g.interviewFocus),
  ].filter(Boolean);
  if (parts.length === 0) return "";
  return [
    `# Grounded context for ${scenario.context.company} (from live web search)`,
    ...parts,
    ``,
  ].join("\n");
}

function firstTextBlock(resp: { content: Array<{ type: string }> }): string {
  const block = resp.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  return block?.text?.trim() ?? "";
}

function extractJson(s: string): Record<string, unknown> {
  if (!s) return {};
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end < 0) return {};
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return {};
  }
}

function normalizeCurveballs(raw: unknown): Curveball[] {
  if (!Array.isArray(raw)) return [];
  const allowedCats = new Set([
    "resume_gap",
    "role_requirement",
    "company_specific",
    "values_probe",
    "technical_depth",
  ]);
  const allowedRisk = new Set(["HIGH", "MEDIUM", "LOW"]);
  const out: Curveball[] = [];
  for (const item of raw) {
    const c = item as Record<string, unknown>;
    const question = String(c.question ?? "").trim();
    if (!question) continue;
    const category = allowedCats.has(String(c.category))
      ? (String(c.category) as Curveball["category"])
      : "role_requirement";
    const risk = allowedRisk.has(String(c.risk).toUpperCase())
      ? (String(c.risk).toUpperCase() as Curveball["risk"])
      : "MEDIUM";
    out.push({
      id: randomUUID(),
      question,
      reason: String(c.reason ?? "").trim(),
      category,
      risk,
    });
  }
  return out.slice(0, 8);
}

function normalizeGapAnalysis(raw: unknown): GapAnalysis {
  const r = (raw ?? {}) as Record<string, unknown>;
  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  return {
    unaddressed: asList(r.unaddressed),
    weak: asList(r.weak),
    strong: asList(r.strong),
  };
}

function normalizeOutcome(raw: unknown, goals: string[]): Outcome {
  const r = (raw ?? {}) as Record<string, unknown>;
  const allowedResult = new Set(["achieved", "partial", "missed"]);
  const allowedFit = new Set(["strong", "mixed", "weak"]);

  const rawGoals = Array.isArray(r.goalAchievement) ? r.goalAchievement : [];
  const goalAchievement = goals.map((goal) => {
    const match = rawGoals.find((g: unknown) => {
      const rec = g as { goal?: unknown };
      return String(rec.goal ?? "").trim() === goal;
    }) as { result?: unknown } | undefined;
    const rawResult = String(match?.result ?? "partial").toLowerCase();
    const result = allowedResult.has(rawResult)
      ? (rawResult as Outcome["goalAchievement"][number]["result"])
      : "partial";
    return { goal, result };
  });

  const roleFitRaw = String(r.roleFit ?? "mixed").toLowerCase();
  const roleFit = allowedFit.has(roleFitRaw)
    ? (roleFitRaw as Outcome["roleFit"])
    : "mixed";

  const salaryOutcome =
    r.salaryOutcome == null || r.salaryOutcome === ""
      ? null
      : String(r.salaryOutcome).trim();

  return {
    goalAchievement,
    salaryOutcome,
    roleFit,
    summary: String(r.summary ?? "").trim(),
  };
}

function pickHighestRiskCurveball(curveballs: Curveball[]): Curveball | null {
  if (curveballs.length === 0) return null;
  const order: Record<Curveball["risk"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return [...curveballs].sort((a, b) => order[a.risk] - order[b.risk])[0];
}
