import {
  simulateArchetype,
  type AgentInput,
  type AgentOutput,
  type ArchetypeAgent,
  type ArchetypeMetadata,
} from "../shared/archetype";

export const metadata: ArchetypeMetadata = {
  archetypeId: "hard_negotiator",
  displayName: "Hard Negotiator",
  title: "Hiring Manager",
  description:
    "Skeptical, time-pressured, already has another finalist. Challenges resume claims and pushes back on comp.",
  pressureStyle:
    "High pressure. Drives comp down. Surfaces gaps candidate didn't prepare for. Interrupts.",
  specialty: "comp negotiation leverage and gap-surface under pressure",
  scopedSubgraphs: ["salary", "company", "profile"] as const,
  version: "1.0.0",
  guildAgentId: null,
};

export async function run(input: AgentInput): Promise<AgentOutput> {
  return simulateArchetype(metadata, input);
}

export const agent: ArchetypeAgent = { metadata, run };
