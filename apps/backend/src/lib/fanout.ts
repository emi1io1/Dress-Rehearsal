import { ARCHETYPES, BATCH_PLAN } from "./personas";
import {
  emit,
  rankRun,
  registerBatchRuns,
  updateConfidence,
} from "./redis";
import { runAnalysisOnly, runCriticalMomentOnly } from "./simulate";
import { createSimulationRun, updateSimulationRun } from "./store";
import type { Outcome, Scenario, SimulationRun } from "@rehearsal/types";

/**
 * Phase 2 fanout: create 10 parallel simulation runs, write initial
 * rows to Insforge, emit progress events to Redis, update the
 * leaderboard + confidence hash as each completes.
 *
 * The 10 workers run concurrently via Promise.all — the UI subscribes
 * to the Redis streams via SSE to watch progress in real time.
 */
export async function kickoffBatch(scenario: Scenario): Promise<string[]> {
  // Create one Insforge row per planned sim, in pending state.
  const pendingRuns: SimulationRun[] = [];
  for (const plan of BATCH_PLAN) {
    const archetype = ARCHETYPES[plan.archetypeId];
    const run = await createSimulationRun({
      scenarioId: scenario.id,
      runType: plan.runType,
      personaArchetype: archetype.id,
      archetypeName: archetype.name,
      curveballs: [],
      gapAnalysis: { unaddressed: [], weak: [], strong: [] },
      criticalMoment: null,
      outcome: null,
      status: "running",
    });
    pendingRuns.push(run);
  }

  const runIds = pendingRuns.map((r) => r.id);
  await registerBatchRuns(scenario.id, runIds);

  // Kick off every worker but don't await — the HTTP response returns
  // immediately so the client can start reading the stream.
  const state = {
    userId: scenario.userId,
    completedSims: 0,
    totalSims: pendingRuns.length,
    fitCounts: { strong: 0, mixed: 0, weak: 0 } as Record<Outcome["roleFit"], number>,
  };

  // Intentionally NOT awaited. void the promise so Node doesn't warn.
  void Promise.all(
    pendingRuns.map((run, i) => runWorker(scenario, run, BATCH_PLAN[i].archetypeId, state)),
  );

  return runIds;
}

async function runWorker(
  scenario: Scenario,
  run: SimulationRun,
  archetypeId: string,
  state: {
    userId: string;
    completedSims: number;
    totalSims: number;
    fitCounts: Record<Outcome["roleFit"], number>;
  },
): Promise<void> {
  const archetype = ARCHETYPES[archetypeId];
  const runId = run.id;
  const now = () => Date.now();

  try {
    await emit(runId, {
      type: "started",
      runId,
      runType: run.runType,
      archetypeId: archetype.id,
      archetypeName: archetype.name,
      at: now(),
    });

    // Stage 1: analysis pass
    const analysis = await runAnalysisOnly({
      scenario,
      runType: run.runType,
      archetypeId,
    });

    await emit(runId, {
      type: "analysis_complete",
      runId,
      curveballs: analysis.curveballs,
      gapAnalysis: analysis.gapAnalysis,
      outcome: analysis.outcome,
      at: now(),
    });

    // Partial persist so /api/scenarios/[id] reflects progress even if the
    // page is reloaded mid-batch.
    await updateSimulationRun(runId, {
      curveballs: analysis.curveballs,
      gapAnalysis: analysis.gapAnalysis,
      outcome: analysis.outcome,
    });

    // Rank + confidence update now that stage 1 has an outcome.
    await rankRun(scenario.id, runId, analysis.outcome);
    state.fitCounts[analysis.outcome.roleFit] += 1;
    await updateConfidence(state.userId, {
      completedSims: state.completedSims,
      totalSims: state.totalSims,
      fitCounts: state.fitCounts,
    });

    // Stage 2: critical moment
    const criticalMoment = await runCriticalMomentOnly({
      scenario,
      runType: run.runType,
      archetype: analysis.archetype,
      curveballs: analysis.curveballs,
    });

    await emit(runId, {
      type: "critical_moment_complete",
      runId,
      criticalMoment,
      at: now(),
    });

    await updateSimulationRun(runId, {
      criticalMoment,
      status: "complete",
    });

    state.completedSims += 1;
    await updateConfidence(state.userId, {
      completedSims: state.completedSims,
      totalSims: state.totalSims,
      fitCounts: state.fitCounts,
    });

    await emit(runId, { type: "done", runId, at: now() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSimulationRun(runId, { status: "error", error: message });
    await emit(runId, { type: "error", runId, message, at: now() });
  }
}
