import { getRegistryEntry } from "@rehearsal/agents";
import { BATCH_PLAN } from "./personas";
import {
  emit,
  rankRun,
  registerBatchRuns,
  updateConfidence,
} from "./redis";
import { runSimulation } from "./simulate";
import {
  createAgentRun,
  createSimulationRun,
  finishAgentRun,
  updateSimulationRun,
} from "./store";
import type { Outcome, Scenario, SimulationRun } from "@rehearsal/types";

/**
 * Phase 2 fanout + Phase 6 audit log.
 *
 * Every simulation goes through a Guild-registered archetype agent. Before
 * invoking the agent, we write an `agent_runs` audit-log row with the
 * input digest. After completion, we finalize the row with the output
 * digest. This gives us a queryable record of every persona invocation
 * attributed to a specific Guild agent ID + code version.
 */
export async function kickoffBatch(scenario: Scenario): Promise<string[]> {
  const pendingRuns: SimulationRun[] = [];
  for (const plan of BATCH_PLAN) {
    const entry = getRegistryEntry(plan.archetypeId);
    if (!entry) {
      throw new Error(
        `BATCH_PLAN references unknown archetype ${plan.archetypeId} — register it in apps/agents.`,
      );
    }
    const run = await createSimulationRun({
      scenarioId: scenario.id,
      runType: plan.runType,
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
    pendingRuns.push(run);
  }

  const runIds = pendingRuns.map((r) => r.id);
  await registerBatchRuns(scenario.id, runIds);

  const state = {
    userId: scenario.userId,
    completedSims: 0,
    totalSims: pendingRuns.length,
    fitCounts: { strong: 0, mixed: 0, weak: 0 } as Record<Outcome["roleFit"], number>,
  };

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
  const entry = getRegistryEntry(archetypeId);
  if (!entry) throw new Error(`Missing registry entry for ${archetypeId}`);
  const runId = run.id;
  const now = () => Date.now();

  // Audit-log: start agent run before we invoke the archetype.
  const agentRun = await createAgentRun({
    simulationRunId: runId,
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
      runType: run.runType,
      goalCount: scenario.userGoals.length,
      groundingPresent: Boolean(scenario.grounding),
      federatedPresent: Boolean(scenario.federatedContext),
    },
    startedAt: new Date().toISOString(),
  });

  try {
    await emit(runId, {
      type: "started",
      runId,
      runType: run.runType,
      archetypeId: entry.archetypeId,
      archetypeName: entry.displayName,
      at: now(),
    });

    // Full agent invocation — stage 1 + 2 inside one Guild-agent call.
    const result = await runSimulation({
      scenario,
      runType: run.runType,
      archetypeId,
    });

    await emit(runId, {
      type: "analysis_complete",
      runId,
      curveballs: result.curveballs,
      gapAnalysis: result.gapAnalysis,
      outcome: result.outcome,
      at: now(),
    });

    await updateSimulationRun(runId, {
      curveballs: result.curveballs,
      gapAnalysis: result.gapAnalysis,
      outcome: result.outcome,
    });

    await rankRun(scenario.id, runId, result.outcome);
    state.fitCounts[result.outcome.roleFit] += 1;
    await updateConfidence(state.userId, {
      completedSims: state.completedSims,
      totalSims: state.totalSims,
      fitCounts: state.fitCounts,
    });

    await emit(runId, {
      type: "critical_moment_complete",
      runId,
      criticalMoment: result.criticalMoment,
      at: now(),
    });

    await updateSimulationRun(runId, {
      criticalMoment: result.criticalMoment,
      status: "complete",
    });

    state.completedSims += 1;
    await updateConfidence(state.userId, {
      completedSims: state.completedSims,
      totalSims: state.totalSims,
      fitCounts: state.fitCounts,
    });

    await emit(runId, { type: "done", runId, at: now() });

    await finishAgentRun(agentRun.id, {
      outputDigest: {
        curveballCount: result.curveballs.length,
        highRiskCount: result.curveballs.filter((c) => c.risk === "HIGH").length,
        handled: result.criticalMoment ? result.criticalMoment.handled : null,
        roleFit: result.outcome.roleFit,
      },
      error: null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSimulationRun(runId, { status: "error", error: message });
    await emit(runId, { type: "error", runId, message, at: now() });
    await finishAgentRun(agentRun.id, { error: message });
  }
}
