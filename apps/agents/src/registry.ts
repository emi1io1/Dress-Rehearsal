import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { agent as friendlyEvaluator } from "./archetypes/friendly-evaluator";
import { agent as fastTrackAssessor } from "./archetypes/fast-track-assessor";
import { agent as cultureProbe } from "./archetypes/culture-probe";
import { agent as technicalSkeptic } from "./archetypes/technical-skeptic";
import { agent as hardNegotiator } from "./archetypes/hard-negotiator";
import type { ArchetypeAgent } from "./shared/archetype";

/**
 * In-memory map of every Guild-registered persona agent. The registry is
 * the single source of truth that `simulate.ts` in the backend reads from —
 * the backend never hard-codes an archetype inline. Adding a new persona
 * is a new file under `archetypes/` + one line here.
 */
export const REGISTRY: Record<string, ArchetypeAgent> = {
  friendly_evaluator: friendlyEvaluator,
  fast_track_assessor: fastTrackAssessor,
  culture_probe: cultureProbe,
  technical_skeptic: technicalSkeptic,
  hard_negotiator: hardNegotiator,
};

export function getAgent(archetypeId: string): ArchetypeAgent | null {
  return REGISTRY[archetypeId] ?? null;
}

export function listAgents(): ArchetypeAgent[] {
  return Object.values(REGISTRY);
}

/**
 * Guild Hub IDs + versions, populated by publish.ts after `guild agent publish`.
 * Stored as a separate JSON file so metadata in the TypeScript sources is
 * immutable between publish runs — the file tracks the real Hub entity.
 */
type PublishedRecord = {
  guildAgentId: string | null;
  version: string | null;
  publishedAt: string | null;
  hubUrl: string | null;
};

type PublishedRegistry = Record<string, PublishedRecord>;

let publishedCache: PublishedRegistry | null = null;

function loadPublished(): PublishedRegistry {
  if (publishedCache) return publishedCache;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const file = resolve(here, "../published.json");
    publishedCache = JSON.parse(readFileSync(file, "utf8")) as PublishedRegistry;
  } catch {
    publishedCache = {};
  }
  return publishedCache;
}

export type RegistryEntry = {
  archetypeId: string;
  displayName: string;
  title: string;
  specialty: string;
  scopedSubgraphs: readonly string[];
  codeVersion: string;       // from the TS metadata
  guildAgentId: string | null;
  guildVersion: string | null;
  hubUrl: string | null;
};

export function getRegistryEntry(archetypeId: string): RegistryEntry | null {
  const agent = REGISTRY[archetypeId];
  if (!agent) return null;
  const pub = loadPublished()[archetypeId] ?? {
    guildAgentId: null,
    version: null,
    publishedAt: null,
    hubUrl: null,
  };
  return {
    archetypeId: agent.metadata.archetypeId,
    displayName: agent.metadata.displayName,
    title: agent.metadata.title,
    specialty: agent.metadata.specialty,
    scopedSubgraphs: agent.metadata.scopedSubgraphs,
    codeVersion: agent.metadata.version,
    guildAgentId: pub.guildAgentId,
    guildVersion: pub.version,
    hubUrl: pub.hubUrl,
  };
}

export function listRegistryEntries(): RegistryEntry[] {
  return Object.keys(REGISTRY).map((id) => getRegistryEntry(id)!);
}
