import {
  simulateArchetype,
  type AgentInput,
  type AgentOutput,
  type ArchetypeAgent,
  type ArchetypeMetadata,
} from "../shared/archetype";

export const metadata: ArchetypeMetadata = {
  archetypeId: "technical_skeptic",
  displayName: "Technical Skeptic",
  title: "Staff Engineer",
  description:
    "Not convinced by resume claims. Asks three-layers-deep technical questions to test real depth.",
  pressureStyle:
    "Medium-to-high pressure. Follows up on every vague answer. Doesn't let hand-waving slide.",
  specialty: "technical depth, system-design tradeoffs, debugging intuition",
  // Deliberately scoped: this archetype shouldn't lean on Glassdoor/culture data;
  // its value is in depth-of-technical-probing.
  scopedSubgraphs: ["salary", "company", "industry"] as const,
  version: "1.0.0",
  guildAgentId: null,
};

export async function run(input: AgentInput): Promise<AgentOutput> {
  return simulateArchetype(metadata, input);
}

export const agent: ArchetypeAgent = { metadata, run };
