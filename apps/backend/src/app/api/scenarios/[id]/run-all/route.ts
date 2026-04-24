import { NextResponse } from "next/server";
import { kickoffBatch } from "@/lib/fanout";
import { buildGrounding } from "@/lib/grounding";
import { getScenario, updateScenarioGrounding } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let scenario = await getScenario(id);
  if (!scenario) return NextResponse.json({ error: "Scenario not found" }, { status: 404 });

  // Ground the scenario in live web context if we haven't already. This runs
  // once per scenario; subsequent batches re-use the same grounding.
  if (!scenario.grounding) {
    try {
      const grounding = await buildGrounding({
        company: scenario.context.company,
        jobTitle: scenario.context.jobTitle,
      });
      if (grounding) {
        const updated = await updateScenarioGrounding(scenario.id, grounding);
        if (updated) scenario = updated;
      }
    } catch (err: unknown) {
      // Grounding failures are non-fatal: simulate without it.
      console.warn("[run-all] grounding failed", err instanceof Error ? err.message : err);
    }
  }

  try {
    const runIds = await kickoffBatch(scenario);
    return NextResponse.json({
      runIds,
      groundingAvailable: Boolean(scenario.grounding),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
