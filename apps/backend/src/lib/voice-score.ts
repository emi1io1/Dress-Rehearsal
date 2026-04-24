import type {
  Scenario,
  VoiceCallBranchPoint,
  VoiceCallGoalOutcome,
} from "@rehearsal/types";
import { DEFAULT_MODEL, getAnthropicClient } from "./claude";

/**
 * Score a Vapi voice call transcript. Produces the same shape as a text
 * simulation's `outcome` plus a numeric score + branch points so the
 * voice and text modes feed the same confidence model.
 */

export type VoiceScoreResult = {
  outcomeScore: number;           // 0–100
  summary: string;
  goalOutcomes: VoiceCallGoalOutcome[];
  branchPoints: VoiceCallBranchPoint[];
};

export async function scoreVoiceCall(input: {
  scenario: Scenario;
  transcript: string;
  archetypeDisplayName: string | null;
  durationSec: number | null;
}): Promise<VoiceScoreResult> {
  const client = getAnthropicClient();

  const system = [
    "You are an interview coach evaluating a live voice interview transcript.",
    "Be direct, specific, and useful. Base every judgment on ACTUAL content of the transcript; do not invent things that weren't said.",
    "Return STRICTLY valid JSON — no markdown, no code fences, no commentary.",
  ].join(" ");

  const user = [
    `# Scenario`,
    `Role: ${input.scenario.context.jobTitle} at ${input.scenario.context.company}`,
    `Interviewer persona: ${input.archetypeDisplayName ?? "unknown"}`,
    input.durationSec ? `Duration: ${Math.round(input.durationSec)}s` : ``,
    ``,
    `# Candidate's goals (they may or may not have surfaced these on the call)`,
    ...input.scenario.userGoals.map((g) => `- ${g}`),
    ``,
    `# Candidate's stated context (used to distinguish 'spoke from prep' from 'improvised')`,
    input.scenario.context.userSkills,
    input.scenario.context.salaryExpectation
      ? `Salary target: ${input.scenario.context.salaryExpectation}`
      : ``,
    ``,
    `# Transcript`,
    input.transcript,
    ``,
    `# Task`,
    `Return JSON:`,
    `{`,
    `  "outcomeScore": <int 0-100 — overall likelihood the candidate advances from this interview, weighted by goal achievement + handling of tough moments>,`,
    `  "summary": "<2-3 sentence bottom line: did they land it? why/why not?>",`,
    `  "goalOutcomes": [`,
    `    {`,
    `      "goal": "<quoted from candidate's goals>",`,
    `      "result": "<achieved | partial | missed>",`,
    `      "evidence": "<short quote or paraphrase from the transcript showing the outcome, or null>"`,
    `    }`,
    `  ],`,
    `  "branchPoints": [`,
    `    { "secondsFromStart": <int or null>, "note": "<1 sentence: where the candidate got cornered, missed an opening, or recovered well>" }`,
    `    // up to 3 entries`,
    `  ]`,
    `}`,
    ``,
    `Rules:`,
    `- One entry in goalOutcomes for EACH goal in the list above, in the same order.`,
    `- branchPoints should focus on moments where the candidate's answer materially changed the trajectory (for better or worse).`,
    `- If the call was extremely short (<1 min) or the candidate barely spoke, mark most goals "missed" and reflect that in the score.`,
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1200,
    system,
    messages: [{ role: "user", content: user }],
  });

  const block = resp.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  const raw = block?.text?.trim() ?? "";
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) {
    return fallback(input.scenario.userGoals);
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return fallback(input.scenario.userGoals);
  }

  const outcomeScore = clamp(Number(parsed.outcomeScore ?? 50), 0, 100);
  const summary = String(parsed.summary ?? "").trim();

  const allowedResult = new Set(["achieved", "partial", "missed"]);
  const rawGoals = Array.isArray(parsed.goalOutcomes) ? parsed.goalOutcomes : [];
  const goalOutcomes: VoiceCallGoalOutcome[] = input.scenario.userGoals.map((goal) => {
    const match = rawGoals.find((g: unknown) => {
      const r = g as { goal?: unknown };
      return String(r.goal ?? "").trim() === goal;
    }) as { result?: unknown; evidence?: unknown } | undefined;
    const result = allowedResult.has(String(match?.result ?? "missed").toLowerCase())
      ? (String(match!.result).toLowerCase() as VoiceCallGoalOutcome["result"])
      : "missed";
    return {
      goal,
      result,
      evidence: match?.evidence ? String(match.evidence).trim() : null,
    };
  });

  const rawBranch = Array.isArray(parsed.branchPoints) ? parsed.branchPoints : [];
  const branchPoints: VoiceCallBranchPoint[] = rawBranch
    .map((b: unknown) => {
      const rec = b as { secondsFromStart?: unknown; note?: unknown };
      const note = String(rec.note ?? "").trim();
      if (!note) return null;
      const sec = rec.secondsFromStart == null ? null : Number(rec.secondsFromStart);
      return {
        secondsFromStart: Number.isFinite(sec as number) ? (sec as number) : null,
        note,
      };
    })
    .filter((b: VoiceCallBranchPoint | null): b is VoiceCallBranchPoint => b !== null)
    .slice(0, 3);

  return { outcomeScore, summary, goalOutcomes, branchPoints };
}

function fallback(goals: string[]): VoiceScoreResult {
  return {
    outcomeScore: 0,
    summary: "Scoring failed to parse a response.",
    goalOutcomes: goals.map((goal) => ({ goal, result: "missed", evidence: null })),
    branchPoints: [],
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
