import { getAgent } from "@rehearsal/agents";
import { simulateArchetype } from "@rehearsal/agents";
import type { AgentInput, AgentOutput, ArchetypeAgent } from "@rehearsal/agents";
import type { RunType, Scenario } from "@rehearsal/types";

/**
 * Backend entry points into the Guild-agent registry.
 *
 * Every simulation invocation goes through a versioned Guild agent
 * (apps/agents/src/archetypes/*.ts). This file only dispatches — no
 * prompt logic lives here anymore. Adding / forking a persona = adding
 * a file under apps/agents, no backend change.
 */

export type SimulationResult = AgentOutput & {
  archetypeId: string;
  archetypeDisplayName: string;
  archetypeCodeVersion: string;
  scopedSubgraphs: readonly string[];
};

function agentFor(archetypeId: string): ArchetypeAgent {
  const agent = getAgent(archetypeId);
  if (!agent) {
    throw new Error(
      `Unknown archetype: ${archetypeId}. Register it in apps/agents/src/registry.ts.`,
    );
  }
  return agent;
}

/**
 * Full two-pass simulation, dispatched through the registered Guild agent
 * for the given archetype.
 */
export async function runSimulation(input: {
  scenario: Scenario;
  runType: RunType;
  archetypeId: string;
}): Promise<SimulationResult> {
  const agent = agentFor(input.archetypeId);
  const out = await agent.run({ scenario: input.scenario, runType: input.runType });
  return {
    ...out,
    archetypeId: agent.metadata.archetypeId,
    archetypeDisplayName: agent.metadata.displayName,
    archetypeCodeVersion: agent.metadata.version,
    scopedSubgraphs: agent.metadata.scopedSubgraphs,
  };
}

/**
 * Phase 2 stream workflow splits the two passes across events. We split
 * the agent's internal simulateArchetype accordingly — one call for the
 * analysis pass is all we need today; stage 2 runs inside the same agent.
 * If workers ever need to stream partial progress mid-agent, that's a
 * feature of simulateArchetype to expose.
 */
export async function runAnalysisOnly(input: {
  scenario: Scenario;
  runType: RunType;
  archetypeId: string;
}): Promise<AgentOutput & { archetypeDisplayName: string; archetypeCodeVersion: string }> {
  const agent = agentFor(input.archetypeId);
  const out = await simulateArchetype(agent.metadata, {
    scenario: input.scenario,
    runType: input.runType,
  });
  return {
    ...out,
    archetypeDisplayName: agent.metadata.displayName,
    archetypeCodeVersion: agent.metadata.version,
  };
}

export function archetypeMetaFor(archetypeId: string) {
  return agentFor(archetypeId).metadata;
}

export type { AgentInput, AgentOutput };
