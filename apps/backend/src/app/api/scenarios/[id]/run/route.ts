import { NextResponse } from "next/server";
import { archetypeForRunType } from "@/lib/personas";
import { runSimulation } from "@/lib/simulate";
import {
  createSimulationRun,
  getScenario,
  updateSimulationRun,
} from "@/lib/store";
import type { RunType } from "@rehearsal/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = { runType?: RunType };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scenario = await getScenario(id);
  if (!scenario) return NextResponse.json({ error: "Scenario not found" }, { status: 404 });

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // defaults
  }

  const runType: RunType = body.runType ?? "likely";
  const archetype = archetypeForRunType(runType);

  const pending = await createSimulationRun({
    scenarioId: scenario.id,
    runType,
    personaArchetype: archetype.id,
    archetypeName: archetype.name,
    curveballs: [],
    gapAnalysis: { unaddressed: [], weak: [], strong: [] },
    criticalMoment: null,
    outcome: null,
    status: "running",
  });

  try {
    const result = await runSimulation({ scenario, runType });
    const updated = await updateSimulationRun(pending.id, {
      archetypeName: result.archetype.name,
      curveballs: result.curveballs,
      gapAnalysis: result.gapAnalysis,
      criticalMoment: result.criticalMoment,
      outcome: result.outcome,
      status: "complete",
    });
    return NextResponse.json({ run: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = await updateSimulationRun(pending.id, {
      status: "error",
      error: message,
    });
    return NextResponse.json({ run: failed, error: message }, { status: 500 });
  }
}
