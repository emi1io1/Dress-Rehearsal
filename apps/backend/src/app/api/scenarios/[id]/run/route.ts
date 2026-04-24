import { NextResponse } from "next/server";
import { getRegistryEntry } from "@rehearsal/agents";
import { RUN_PROFILE } from "@/lib/personas";
import { runSimulation } from "@/lib/simulate";
import {
  createAgentRun,
  createSimulationRun,
  finishAgentRun,
  getScenario,
  updateSimulationRun,
} from "@/lib/store";
import type { RunType } from "@rehearsal/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = { runType?: RunType; archetypeId?: string };

/**
 * Single-sim endpoint (pre-Phase-2). Retained for one-off testing —
 * Phase 2 onward the UI uses /run-all. This still writes an agent_runs
 * audit entry just like the parallel workers do.
 */
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
  const archetypeId = body.archetypeId ?? RUN_PROFILE[runType].archetypeId;
  const entry = getRegistryEntry(archetypeId);
  if (!entry) {
    return NextResponse.json({ error: `Unknown archetype ${archetypeId}` }, { status: 400 });
  }

  const pending = await createSimulationRun({
    scenarioId: scenario.id,
    runType,
    personaArchetype: entry.archetypeId,
    archetypeName: entry.displayName,
    archetypeCodeVersion: entry.codeVersion,
    guildAgentId: entry.guildAgentId,
    guildAgentVersion: entry.guildVersion,
    curveballs: [],
    gapAnalysis: { unaddressed: [], weak: [], strong: [] },
    criticalMoment: null,
    outcome: null,
    status: "running",
  });

  const agentRun = await createAgentRun({
    simulationRunId: pending.id,
    archetypeId: entry.archetypeId,
    guildAgentId: entry.guildAgentId,
    guildAgentVersion: entry.guildVersion,
    archetypeCodeVersion: entry.codeVersion,
    archetypeDisplayName: entry.displayName,
    scopedSubgraphs: [...entry.scopedSubgraphs],
    inputDigest: {
      scenarioId: scenario.id,
      company: scenario.context.company,
      jobTitle: scenario.context.jobTitle,
      runType,
      goalCount: scenario.userGoals.length,
      groundingPresent: Boolean(scenario.grounding),
      federatedPresent: Boolean(scenario.federatedContext),
    },
    startedAt: new Date().toISOString(),
  });

  try {
    const result = await runSimulation({ scenario, runType, archetypeId });
    const updated = await updateSimulationRun(pending.id, {
      curveballs: result.curveballs,
      gapAnalysis: result.gapAnalysis,
      criticalMoment: result.criticalMoment,
      outcome: result.outcome,
      status: "complete",
    });
    await finishAgentRun(agentRun.id, {
      outputDigest: {
        curveballCount: result.curveballs.length,
        highRiskCount: result.curveballs.filter((c) => c.risk === "HIGH").length,
        handled: result.criticalMoment ? result.criticalMoment.handled : null,
        roleFit: result.outcome.roleFit,
      },
      error: null,
    });
    return NextResponse.json({ run: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = await updateSimulationRun(pending.id, {
      status: "error",
      error: message,
    });
    await finishAgentRun(agentRun.id, { error: message });
    return NextResponse.json({ run: failed, error: message }, { status: 500 });
  }
}
