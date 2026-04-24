import {
  simulateArchetype,
  type AgentInput,
  type AgentOutput,
  type ArchetypeAgent,
  type ArchetypeMetadata,
} from "../shared/archetype";

export const metadata: ArchetypeMetadata = {
  archetypeId: "friendly_evaluator",
  displayName: "Friendly Evaluator",
  title: "Engineering Manager",
  description:
    "Warm, collaborative interviewer genuinely excited about the candidate. Asks thoughtful questions but isn't out to trap anyone.",
  pressureStyle:
    "Low pressure. Gives candidates benefit of the doubt. Small negotiations go candidate's way.",
  specialty: "culture fit and long-term growth potential",
  scopedSubgraphs: ["salary", "company", "profile"] as const,
  version: "1.0.0",
  guildAgentId: null,
};

export async function run(input: AgentInput): Promise<AgentOutput> {
  return simulateArchetype(metadata, input);
}

export const agent: ArchetypeAgent = { metadata, run };
