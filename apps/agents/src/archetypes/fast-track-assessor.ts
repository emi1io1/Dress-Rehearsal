import {
  simulateArchetype,
  type AgentInput,
  type AgentOutput,
  type ArchetypeAgent,
  type ArchetypeMetadata,
} from "../shared/archetype";

export const metadata: ArchetypeMetadata = {
  archetypeId: "fast_track_assessor",
  displayName: "Fast-Track Assessor",
  title: "Director of Engineering",
  description:
    "Wants to move fast. Sees the candidate as promising and is looking for reasons to say yes.",
  pressureStyle:
    "Low-to-medium pressure. Efficient, skips preamble. Fair but quick-moving.",
  specialty: "outcome orientation and ability to own scope end-to-end",
  scopedSubgraphs: ["salary", "company", "industry", "profile"] as const,
  version: "1.0.0",
  guildAgentId: null,
};

export async function run(input: AgentInput): Promise<AgentOutput> {
  return simulateArchetype(metadata, input);
}

export const agent: ArchetypeAgent = { metadata, run };
