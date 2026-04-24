import {
  simulateArchetype,
  type AgentInput,
  type AgentOutput,
  type ArchetypeAgent,
  type ArchetypeMetadata,
} from "../shared/archetype";

export const metadata: ArchetypeMetadata = {
  archetypeId: "culture_probe",
  displayName: "Culture Probe",
  title: "Senior Staff Engineer",
  description:
    "Looks past the resume to probe values, working style, and conflict behavior. Neutral tone, listens hard.",
  pressureStyle:
    "Medium pressure. Won't accept platitudes — pushes for specifics and counter-examples.",
  specialty: "values alignment, conflict stories, and honest self-assessment",
  scopedSubgraphs: ["company", "industry", "profile"] as const,
  version: "1.0.0",
  guildAgentId: null,
};

export async function run(input: AgentInput): Promise<AgentOutput> {
  return simulateArchetype(metadata, input);
}

export const agent: ArchetypeAgent = { metadata, run };
