import { randomUUID } from "node:crypto";
import type { Curveball, GapAnalysis, Outcome } from "@rehearsal/types";

export function firstTextBlock(resp: { content: Array<{ type: string }> }): string {
  const block = resp.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  return block?.text?.trim() ?? "";
}

export function extractJson(s: string): Record<string, unknown> {
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

export function normalizeCurveballs(raw: unknown): Curveball[] {
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

export function normalizeGapAnalysis(raw: unknown): GapAnalysis {
  const r = (raw ?? {}) as Record<string, unknown>;
  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  return {
    unaddressed: asList(r.unaddressed),
    weak: asList(r.weak),
    strong: asList(r.strong),
  };
}

export function normalizeOutcome(raw: unknown, goals: string[]): Outcome {
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

export function pickHighestRiskCurveball(curveballs: Curveball[]): Curveball | null {
  if (curveballs.length === 0) return null;
  const order: Record<Curveball["risk"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return [...curveballs].sort((a, b) => order[a.risk] - order[b.risk])[0];
}
