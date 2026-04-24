import type { RunType } from "@rehearsal/types";

export type PersonaArchetype = {
  id: string;
  name: string;
  title: string;
  description: string;
  pressureStyle: string;
};

export const ARCHETYPES: Record<string, PersonaArchetype> = {
  friendly_evaluator: {
    id: "friendly_evaluator",
    name: "Friendly Evaluator",
    title: "Engineering Manager",
    description:
      "Warm, collaborative interviewer genuinely excited about the candidate. Asks thoughtful questions but isn't out to trap anyone.",
    pressureStyle:
      "Low pressure. Gives candidates benefit of the doubt. Small negotiations go candidate's way.",
  },
  fast_track_assessor: {
    id: "fast_track_assessor",
    name: "Fast-Track Assessor",
    title: "Director of Engineering",
    description:
      "Wants to move fast. Sees the candidate as promising and is looking for reasons to say yes.",
    pressureStyle:
      "Low-to-medium pressure. Efficient, skips preamble. Fair but quick-moving.",
  },
  culture_probe: {
    id: "culture_probe",
    name: "Culture Probe",
    title: "Senior Staff Engineer",
    description:
      "Looks past the resume to probe values, working style, and conflict behavior. Neutral tone, listens hard.",
    pressureStyle:
      "Medium pressure. Won't accept platitudes — pushes for specifics and counter-examples.",
  },
  technical_skeptic: {
    id: "technical_skeptic",
    name: "Technical Skeptic",
    title: "Staff Engineer",
    description:
      "Not convinced by resume claims. Asks three-layers-deep technical questions to test real depth.",
    pressureStyle:
      "Medium-to-high pressure. Follows up on every vague answer. Doesn't let hand-waving slide.",
  },
  hard_negotiator: {
    id: "hard_negotiator",
    name: "Hard Negotiator",
    title: "Hiring Manager",
    description:
      "Skeptical, time-pressured, already has another finalist. Challenges resume claims and pushes back on comp.",
    pressureStyle:
      "High pressure. Drives comp down. Surfaces gaps candidate didn't prepare for. Interrupts.",
  },
};

export const RUN_PROFILE: Record<
  RunType,
  { label: string; archetypeId: string; tone: string }
> = {
  best: {
    label: "Best case",
    archetypeId: "friendly_evaluator",
    tone:
      "Interviewer is receptive and generous. Candidate benefits from favorable framing.",
  },
  likely: {
    label: "Likely case",
    archetypeId: "technical_skeptic",
    tone:
      "Interviewer is professional and fair but probing. Candidate must earn each yes.",
  },
  worst: {
    label: "Worst case",
    archetypeId: "hard_negotiator",
    tone:
      "Interviewer is skeptical, aggressive, time-pressured. Candidate must handle pushback on gaps and comp.",
  },
};

export function archetypeForRunType(runType: RunType): PersonaArchetype {
  return ARCHETYPES[RUN_PROFILE[runType].archetypeId];
}

/**
 * The 10-sim archetype plan used by Phase 2's parallel batch.
 * Spread: 3 best / 4 likely / 3 worst, with diverse archetypes within each bucket
 * so the aggregate signal isn't dominated by a single perspective.
 */
export const BATCH_PLAN: Array<{ runType: RunType; archetypeId: string }> = [
  // Best case (3)
  { runType: "best", archetypeId: "friendly_evaluator" },
  { runType: "best", archetypeId: "fast_track_assessor" },
  { runType: "best", archetypeId: "friendly_evaluator" },
  // Likely case (4)
  { runType: "likely", archetypeId: "technical_skeptic" },
  { runType: "likely", archetypeId: "culture_probe" },
  { runType: "likely", archetypeId: "technical_skeptic" },
  { runType: "likely", archetypeId: "culture_probe" },
  // Worst case (3)
  { runType: "worst", archetypeId: "hard_negotiator" },
  { runType: "worst", archetypeId: "technical_skeptic" },
  { runType: "worst", archetypeId: "hard_negotiator" },
];
