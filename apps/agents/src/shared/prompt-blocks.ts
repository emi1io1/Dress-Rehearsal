import type { Scenario } from "@rehearsal/types";

export function buildGroundingBlock(scenario: Scenario): string {
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

export function buildFederatedBlock(scenario: Scenario): string {
  const f = scenario.federatedContext;
  if (!f) return "";
  const lines: string[] = [`# Federated context (via WunderGraph Cosmo supergraph)`];

  if (f.salary) {
    const s = f.salary;
    const equity = s.equitySignalUSD
      ? `; signal equity ~$${s.equitySignalUSD.toLocaleString()}`
      : "";
    lines.push(
      `Salary benchmark (${s.source}) for ${s.jobTitle}${s.company ? ` @ ${s.company}` : ""}:`,
      `- p25 $${s.p25.toLocaleString()} · p50 $${s.p50.toLocaleString()} · p75 $${s.p75.toLocaleString()} · p90 $${s.p90.toLocaleString()}${equity}`,
    );
  }

  if (f.company) {
    const c = f.company;
    const funding = c.recentFundingUSD
      ? `~$${Math.round(c.recentFundingUSD / 1_000_000).toLocaleString()}M recent funding`
      : null;
    lines.push(
      `Company profile — ${c.name}:`,
      `- ${c.industry} · ${c.stage.replace(/_/g, " ").toLowerCase()} · ${c.employeeRange} employees${funding ? ` · ${funding}` : ""}`,
      c.notableProducts.length
        ? `- Notable products: ${c.notableProducts.join(", ")}`
        : "",
    );
  }

  if (f.industrySignals.length) {
    lines.push(
      `Industry signals (live):`,
      ...f.industrySignals
        .slice(0, 3)
        .map((s) => `- ${s.title}${s.siteName ? ` (${s.siteName})` : ""}`),
    );
  }

  if (f.profile && f.profile.totalScenarios > 0) {
    const p = f.profile;
    lines.push(
      `Candidate's rehearsal history:`,
      `- Practiced ${p.totalScenarios} scenarios before${p.recentRoles.length ? `, targeting roles like ${p.recentRoles.slice(0, 3).join(", ")}` : ""}.`,
    );
  }

  lines.push(``);
  return lines.filter((l) => l !== "").join("\n") + "\n";
}
