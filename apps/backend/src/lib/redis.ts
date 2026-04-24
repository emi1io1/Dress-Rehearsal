import { Redis } from "@upstash/redis";
import type {
  CriticalMoment,
  Curveball,
  GapAnalysis,
  Outcome,
  RunType,
} from "@rehearsal/types";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in .env.local.",
    );
  }
  client = new Redis({ url, token });
  return client;
}

// ---------- keys ----------

export const keys = {
  simEvents: (runId: string) => `sim:${runId}:events`,
  scenarioRuns: (scenarioId: string) => `scenario:${scenarioId}:runs`,
  scenarioLeaderboard: (scenarioId: string) => `scenario:${scenarioId}:leaderboard`,
  userConfidence: (userId: string) => `user:${userId}:confidence`,
};

// ---------- event types ----------

export type SimEvent =
  | {
      type: "started";
      runId: string;
      runType: RunType;
      archetypeId: string;
      archetypeName: string;
      at: number;
    }
  | {
      type: "analysis_complete";
      runId: string;
      curveballs: Curveball[];
      gapAnalysis: GapAnalysis;
      outcome: Outcome;
      at: number;
    }
  | {
      type: "critical_moment_complete";
      runId: string;
      criticalMoment: CriticalMoment | null;
      at: number;
    }
  | { type: "done"; runId: string; at: number }
  | { type: "error"; runId: string; message: string; at: number };

// ---------- streams ----------

/**
 * Append an event to a sim's stream. Redis Streams give us an append-only log
 * per sim that the SSE endpoint can tail via XRANGE.
 */
export async function emit(runId: string, event: SimEvent): Promise<void> {
  const redis = getRedis();
  await redis.xadd(keys.simEvents(runId), "*", {
    payload: JSON.stringify(event),
  });
}

/**
 * Read all events from a sim's stream after the given id (exclusive).
 * Pass "-" as lastId for "from the start". Returns entries with their stream id
 * so the caller can checkpoint.
 */
export async function readEvents(
  runId: string,
  lastId: string,
): Promise<Array<{ id: string; event: SimEvent }>> {
  const redis = getRedis();
  // Upstash xrange with exclusive lower bound: use "(<id>" syntax.
  const start = lastId === "-" ? "-" : `(${lastId}`;
  // Upstash SDK returns Record<streamId, fields> map or an array depending on version.
  // Normalize to array of [id, fields] tuples.
  const raw = (await redis.xrange(keys.simEvents(runId), start, "+")) as unknown;
  return normalizeXrange(raw);
}

function normalizeXrange(raw: unknown): Array<{ id: string; event: SimEvent }> {
  if (!raw) return [];
  // Upstash auto-parses JSON field values on read. `payload` may arrive as an
  // already-deserialized object — only re-parse if we got a string back.
  const coerce = (v: unknown): SimEvent =>
    (typeof v === "string" ? JSON.parse(v) : v) as SimEvent;

  // Upstash v1+ returns a Record<string, Record<string, unknown>>
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, Record<string, unknown>>;
    return Object.entries(obj).map(([id, fields]) => ({
      id,
      event: coerce(fields.payload),
    }));
  }
  // Older array form: [[id, [k, v, k, v, ...]], ...]
  if (Array.isArray(raw)) {
    return raw.map((entry: unknown) => {
      const [id, fieldArr] = entry as [string, unknown[]];
      const fields: Record<string, unknown> = {};
      for (let i = 0; i < fieldArr.length; i += 2) {
        fields[String(fieldArr[i])] = fieldArr[i + 1];
      }
      return { id, event: coerce(fields.payload) };
    });
  }
  return [];
}

// ---------- scenario run set ----------

export async function registerBatchRuns(
  scenarioId: string,
  runIds: string[],
): Promise<void> {
  const redis = getRedis();
  // Clear any prior batch's runIds so the SSE stream only tails the current one.
  await redis.del(keys.scenarioRuns(scenarioId));
  if (runIds.length === 0) return;
  await redis.sadd(keys.scenarioRuns(scenarioId), runIds[0], ...runIds.slice(1));
  await redis.expire(keys.scenarioRuns(scenarioId), 60 * 60 * 24);
}

export async function getBatchRunIds(scenarioId: string): Promise<string[]> {
  const redis = getRedis();
  const raw = (await redis.smembers(keys.scenarioRuns(scenarioId))) as string[];
  return raw ?? [];
}

// ---------- leaderboard (sorted set) ----------

const FIT_SCORE: Record<Outcome["roleFit"], number> = {
  strong: 3,
  mixed: 2,
  weak: 1,
};

/**
 * Higher score = better fit for the candidate. We combine role fit with
 * goal-achievement count so a "strong" with 3 missed goals sorts lower
 * than a "strong" that landed all its goals.
 */
export function leaderboardScore(outcome: Outcome): number {
  const base = FIT_SCORE[outcome.roleFit] * 100;
  const achieved = outcome.goalAchievement.filter((g) => g.result === "achieved").length;
  const partial = outcome.goalAchievement.filter((g) => g.result === "partial").length;
  return base + achieved * 10 + partial * 3;
}

export async function rankRun(
  scenarioId: string,
  runId: string,
  outcome: Outcome,
): Promise<void> {
  const redis = getRedis();
  const score = leaderboardScore(outcome);
  const key = keys.scenarioLeaderboard(scenarioId);
  await redis.zadd(key, { score, member: runId });
  await redis.expire(key, 60 * 60 * 24);
}

// ---------- user confidence hash ----------

/**
 * Running confidence metrics across the batch. The UI reads this to animate
 * the confidence bar in Phase 8. For now we populate the keys so the
 * upstream work exists.
 */
export async function updateConfidence(
  userId: string,
  batch: {
    completedSims: number;
    totalSims: number;
    fitCounts: { strong: number; mixed: number; weak: number };
  },
): Promise<void> {
  const redis = getRedis();
  const pct = Math.round(
    ((batch.fitCounts.strong * 1 + batch.fitCounts.mixed * 0.5) /
      Math.max(batch.totalSims, 1)) *
      100,
  );
  await redis.hset(keys.userConfidence(userId), {
    completed: String(batch.completedSims),
    total: String(batch.totalSims),
    strong: String(batch.fitCounts.strong),
    mixed: String(batch.fitCounts.mixed),
    weak: String(batch.fitCounts.weak),
    confidencePct: String(pct),
    updatedAt: new Date().toISOString(),
  });
}
