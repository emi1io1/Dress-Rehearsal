import { getRegistryEntry } from "@rehearsal/agents";
import type { RunType, Scenario } from "@rehearsal/types";
import type { CreateAssistantBody, VapiVoice } from "./vapi";

/**
 * Translate a Rehearsal scenario + chosen archetype + runType into a
 * Vapi assistant config. The assistant plays the interviewer. Candidate
 * (the user) speaks via their browser mic.
 *
 * Notes:
 * - We use OpenAI gpt-4o-mini as the realtime model. gpt-4o's latency on
 *   Vapi is the standard for voice; anything larger adds noticeable lag.
 * - Voice is picked per archetype so personas sound visibly different.
 * - The system prompt stuffs everything a text sim would have: grounding,
 *   federated context, candidate's stated context. No tools — this is a
 *   conversational simulator, not an agent that calls external APIs.
 */

// Voice mapping per archetype. Values are ElevenLabs IDs used widely on
// Vapi; swap to other providers (playht, openai, cartesia) if you prefer.
// Using ElevenLabs for a consistent, natural feel across archetypes.
const ARCHETYPE_VOICE: Record<string, VapiVoice> = {
  friendly_evaluator: { provider: "11labs", voiceId: "ThT5KcBeYPX3keUQqHPh" },   // Dorothy — warm
  fast_track_assessor: { provider: "11labs", voiceId: "VR6AewLTigWG4xSOukaG" },   // Arnold — direct
  culture_probe: { provider: "11labs", voiceId: "21m00Tcm4TlvDq8ikWAM" },         // Rachel — neutral/clear
  technical_skeptic: { provider: "11labs", voiceId: "pNInz6obpgDQGcFmaJgB" },     // Adam — measured
  hard_negotiator: { provider: "11labs", voiceId: "TxGEqnHWrfWFTfGW9XjX" },       // Josh — low, firm
};

const DEFAULT_VOICE: VapiVoice = {
  provider: "11labs",
  voiceId: "21m00Tcm4TlvDq8ikWAM",
};

const RUN_PROFILE_COPY: Record<RunType, string> = {
  best: "You are receptive and generous. Impressed early. Lean toward the candidate.",
  likely: "You are professional and non-committal. Probe tough questions. Stay fair.",
  worst: "You are skeptical, time-pressured, and slightly abrasive. Challenge resume claims; push back on comp; bring up concerns the candidate didn't prepare for.",
};

export type BuildAssistantInput = {
  scenario: Scenario;
  runType: RunType;
  archetypeId: string;
  serverUrl?: string;
  voiceCallId: string; // our internal UUID — included in metadata for webhook correlation
};

export function buildVoiceAssistant(input: BuildAssistantInput): CreateAssistantBody {
  const entry = getRegistryEntry(input.archetypeId);
  if (!entry) {
    throw new Error(`Unknown archetype ${input.archetypeId}`);
  }
  const voice = ARCHETYPE_VOICE[input.archetypeId] ?? DEFAULT_VOICE;
  const runProfile = RUN_PROFILE_COPY[input.runType];

  const groundingBullets = input.scenario.grounding
    ? [
        ...input.scenario.grounding.newsItems.slice(0, 3).map((b) => `• News: ${b}`),
        ...input.scenario.grounding.cultureSignals.slice(0, 2).map((b) => `• Culture: ${b}`),
        ...input.scenario.grounding.interviewFocus.slice(0, 2).map((b) => `• Interview focus: ${b}`),
      ]
    : [];

  const federatedBullets = input.scenario.federatedContext
    ? buildFederatedBullets(input.scenario.federatedContext)
    : [];

  const humanName = ARCHETYPE_HUMAN_NAME[input.archetypeId] ?? "Alex";
  const systemPrompt = [
    `You are ${humanName}, a ${entry.title} at ${input.scenario.context.company}, conducting a live voice interview for the ${input.scenario.context.jobTitle} role.`,
    ``,
    `# Your persona (archetype: "${entry.displayName}" — internal label, do not say aloud)`,
    `Specialty: ${entry.specialty}.`,
    `Style for THIS interview: ${runProfile}`,
    ``,
    `# The role`,
    `Title: ${input.scenario.context.jobTitle}`,
    `Company: ${input.scenario.context.company}`,
    ``,
    `Job description:`,
    input.scenario.context.jobDescription,
    ``,
    groundingBullets.length ? `# Live context about the company (use these to ask company-specific questions):\n${groundingBullets.join("\n")}\n` : "",
    federatedBullets.length ? `# Federated data you know about this role/company:\n${federatedBullets.join("\n")}\n` : "",
    `# What you know about the candidate (stated resume)`,
    input.scenario.context.userSkills,
    input.scenario.context.salaryExpectation
      ? `\nSalary target mentioned: ${input.scenario.context.salaryExpectation}`
      : "",
    input.scenario.context.otherContext
      ? `\nAdditional context: ${input.scenario.context.otherContext}`
      : "",
    ``,
    `# Candidate's goals (they haven't told you these — you're probing to see if they surface them)`,
    ...input.scenario.userGoals.map((g) => `- ${g}`),
    ``,
    `# Rules for the voice interview`,
    `- Stay IN CHARACTER as ${humanName}. Do NOT narrate, do NOT break the fourth wall. Never say the archetype label aloud.`,
    `- Ask ONE question at a time. Let the candidate respond. Don't monologue.`,
    `- Talk like a real human interviewer — short sentences, conversational pacing, natural filler is OK.`,
    `- Push on vague answers. Follow up at least once if the candidate hand-waves.`,
    `- When the candidate asks YOU a question, answer briefly and return the floor with another question.`,
    `- Aim for a 5-10 minute interview. Cover ~5-7 topics from the job description and candidate's background.`,
    `- When you feel the interview is at a natural close, say something like "That's all I had on my side — any questions for me?" and after they respond, wrap with "Thanks for your time, we'll be in touch."`,
    `- Do NOT invent facts about ${input.scenario.context.company} beyond what's in the live context above.`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const firstMessage = buildFirstMessage(input.archetypeId, input.scenario.context.jobTitle, input.scenario.context.company, input.runType);

  // Vapi caps the assistant name at 40 characters. We keep archetype + company
  // but truncate the company tail if needed so the full name stays legible.
  const rawName = `${entry.displayName} · ${input.scenario.context.company}`;
  const name = rawName.length <= 40 ? rawName : rawName.slice(0, 37) + "...";

  return {
    name,
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 300,
      messages: [{ role: "system", content: systemPrompt }],
    },
    voice,
    firstMessage,
    serverUrl: input.serverUrl,
    endCallPhrases: ["we'll be in touch", "thanks for your time", "take care"],
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 15 * 60, // 15 min hard cap
    metadata: {
      voiceCallId: input.voiceCallId,
      scenarioId: input.scenario.id,
      archetypeId: input.archetypeId,
      runType: input.runType,
    },
  };
}

// Archetype display names are labels, not real people. Pair each with a
// plausible human first name so the interviewer introduces themselves
// naturally ("Hi, I'm Priya") instead of ("Hi, I'm Technical").
const ARCHETYPE_HUMAN_NAME: Record<string, string> = {
  friendly_evaluator: "Maya",
  fast_track_assessor: "Jordan",
  culture_probe: "Sasha",
  technical_skeptic: "Priya",
  hard_negotiator: "Dana",
};

function buildFirstMessage(archetypeId: string, jobTitle: string, company: string, runType: RunType): string {
  const name = ARCHETYPE_HUMAN_NAME[archetypeId] ?? "Alex";
  if (runType === "best") {
    return `Hi, great to meet you. I'm ${name} — I'll be interviewing you today for the ${jobTitle} role at ${company}. Thanks for making time. Want to start by telling me a bit about what drew you to the role?`;
  }
  if (runType === "worst") {
    return `Thanks for jumping on. I'm ${name}. Look, I'll be direct — we've got a couple finalists for this ${jobTitle} seat and I want to use our time well. Walk me through your most relevant project and why you think you're the right fit here.`;
  }
  return `Hey, I'm ${name}. Thanks for the time — I'll be running the interview for the ${jobTitle} role today. To kick off: give me the 2-minute version of your background and what you're looking for next.`;
}

function buildFederatedBullets(f: NonNullable<Scenario["federatedContext"]>): string[] {
  const bullets: string[] = [];
  if (f.salary) {
    bullets.push(
      `• Known salary band for this role: p25 $${f.salary.p25.toLocaleString()} · p50 $${f.salary.p50.toLocaleString()} · p90 $${f.salary.p90.toLocaleString()} (${f.salary.source}).`,
    );
  }
  if (f.company) {
    bullets.push(
      `• Company stage: ${f.company.stage.replace(/_/g, " ").toLowerCase()}, ${f.company.employeeRange} employees, industry: ${f.company.industry}.`,
    );
  }
  if (f.industrySignals.length > 0) {
    bullets.push(
      `• Recent industry signals: ${f.industrySignals.slice(0, 2).map((s) => s.title).join(" · ")}.`,
    );
  }
  return bullets;
}
