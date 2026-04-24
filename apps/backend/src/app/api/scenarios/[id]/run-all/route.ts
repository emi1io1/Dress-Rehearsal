import { NextResponse } from "next/server";
import { kickoffBatch } from "@/lib/fanout";
import { fetchFederatedContext } from "@/lib/graph";
import { buildGrounding } from "@/lib/grounding";
import {
  getScenario,
  updateScenarioFederatedContext,
  updateScenarioGrounding,
} from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let scenario = await getScenario(id);
  if (!scenario) return NextResponse.json({ error: "Scenario not found" }, { status: 404 });

  // Ground + federate in parallel if either is missing. Both are cached on
  // the scenario after first success so re-runs are free.
  await Promise.all([
    (async () => {
      if (scenario!.grounding) return;
      try {
        const g = await buildGrounding({
          company: scenario!.context.company,
          jobTitle: scenario!.context.jobTitle,
        });
        if (g) {
          const updated = await updateScenarioGrounding(scenario!.id, g);
          if (updated) scenario = updated;
        }
      } catch (err: unknown) {
        console.warn("[run-all] grounding failed", err instanceof Error ? err.message : err);
      }
    })(),
    (async () => {
      if (scenario!.federatedContext) return;
      try {
        const fc = await fetchFederatedContext({
          company: scenario!.context.company,
          jobTitle: scenario!.context.jobTitle,
          userId: scenario!.userId,
        });
        if (fc) {
          const updated = await updateScenarioFederatedContext(scenario!.id, fc);
          if (updated) scenario = updated;
        }
      } catch (err: unknown) {
        console.warn(
          "[run-all] federated context failed",
          err instanceof Error ? err.message : err,
        );
      }
    })(),
  ]);

  try {
    const runIds = await kickoffBatch(scenario);
    return NextResponse.json({
      runIds,
      groundingAvailable: Boolean(scenario.grounding),
      federatedContextAvailable: Boolean(scenario.federatedContext),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
