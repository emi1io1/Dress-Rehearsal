import { DEFAULT_MODEL, getAnthropicClient } from "./claude";
import { hasTinyfishKey, tinyfishSearch, type TinyfishResult } from "./tinyfish";
import type { Grounding, GroundingSource } from "@rehearsal/types";

/**
 * Ground a scenario in live web context via TinyFish + Claude.
 *
 * Three targeted searches, combined snippets, then one Claude distillation
 * call into the shape the simulation prompts expect.
 *
 * Fails soft: if TinyFish is unavailable or rate-limited, returns null and
 * the caller proceeds without grounding. We'd rather ship a slightly less
 * grounded sim than block the batch entirely.
 */
export async function buildGrounding(input: {
  company: string;
  jobTitle: string;
}): Promise<Grounding | null> {
  if (!hasTinyfishKey()) return null;

  const { company, jobTitle } = input;
  const queries = [
    { topic: "news", q: `${company} company news 2026` },
    { topic: "culture", q: `${company} glassdoor interview experience ${jobTitle}` },
    { topic: "events", q: `${company} funding layoffs strategic 2026` },
  ];

  const results = await Promise.all(
    queries.map(async ({ topic, q }) => {
      try {
        const r = await tinyfishSearch(q, { location: "US", language: "en" });
        return { topic, query: q, results: r.results.slice(0, 5) };
      } catch (err: unknown) {
        console.warn("[grounding] tinyfish search failed", {
          topic,
          message: err instanceof Error ? err.message : String(err),
        });
        return { topic, query: q, results: [] as TinyfishResult[] };
      }
    }),
  );

  const totalSnippets = results.reduce((acc, r) => acc + r.results.length, 0);
  if (totalSnippets === 0) return null;

  const sources: GroundingSource[] = [];
  const seenUrls = new Set<string>();
  for (const bucket of results) {
    for (const r of bucket.results) {
      if (seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      sources.push({
        title: r.title,
        url: r.url,
        siteName: r.site_name || null,
      });
    }
  }

  const distilled = await distillWithClaude({ company, jobTitle, buckets: results });
  if (!distilled) return null;

  return {
    ...distilled,
    sources,
    generatedAt: new Date().toISOString(),
  };
}

type DistillInput = {
  company: string;
  jobTitle: string;
  buckets: Array<{ topic: string; query: string; results: TinyfishResult[] }>;
};

async function distillWithClaude(input: DistillInput): Promise<{
  newsItems: string[];
  cultureSignals: string[];
  recentEvents: string[];
  interviewFocus: string[];
} | null> {
  const client = getAnthropicClient();

  const bucketText = input.buckets
    .filter((b) => b.results.length > 0)
    .map((b) => {
      const lines = b.results.map(
        (r, i) => `[${i + 1}] ${r.title}\n    ${r.snippet}\n    (${r.site_name} · ${r.url})`,
      );
      return `### ${b.topic.toUpperCase()} — query: "${b.query}"\n${lines.join("\n")}`;
    })
    .join("\n\n");

  const system = [
    "You distill raw web search snippets into a structured grounding brief for a job interview simulation.",
    "Only include claims the snippets actually support. Never invent facts. If a category has no support, return an empty array for it.",
    "Return STRICTLY valid JSON — no markdown, no code fences, no commentary.",
  ].join(" ");

  const user = [
    `# Target`,
    `Company: ${input.company}`,
    `Role: ${input.jobTitle}`,
    ``,
    `# Raw snippets`,
    bucketText,
    ``,
    `# Task`,
    `Return JSON:`,
    `{`,
    `  "newsItems": [ "<1-sentence bullet on recent moves: funding, launches, hires, etc.>", ... 2-4 items ],`,
    `  "cultureSignals": [ "<1-sentence bullet on interview style, culture, what employees report>", ... 2-4 items ],`,
    `  "recentEvents": [ "<1-sentence bullet on strategic shifts, layoffs, reorgs, pressures>", ... 1-3 items ],`,
    `  "interviewFocus": [ "<1-sentence bullet on topics this company's interviews consistently probe for this role>", ... 2-4 items ]`,
    `}`,
    ``,
    `Rules:`,
    `- Each bullet is a complete, attributable claim — no hedging like "it seems" or "some reports".`,
    `- If snippets are generic marketing copy, skip them. We want specifics: dates, dollar amounts, headcount changes, named products, named practices.`,
    `- interviewFocus should read like "expect technical system-design rounds emphasizing X", not "interviews may involve various topics".`,
  ].join("\n");

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
  if (start < 0 || end < 0) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

  return {
    newsItems: asList(parsed.newsItems),
    cultureSignals: asList(parsed.cultureSignals),
    recentEvents: asList(parsed.recentEvents),
    interviewFocus: asList(parsed.interviewFocus),
  };
}
