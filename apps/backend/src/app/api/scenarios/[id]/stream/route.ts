import { getBatchRunIds, readEvents } from "@/lib/redis";
import { getScenario } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Server-Sent Events tailing the Redis streams for all runs in the scenario's
 * active batch. The client opens this once after POSTing /run-all and the
 * server pushes one message per sim event until every sim emits "done" (or
 * we hit the timeout).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scenario = await getScenario(id);
  if (!scenario) return new Response("Scenario not found", { status: 404 });

  const runIds = await getBatchRunIds(id);
  if (runIds.length === 0) {
    return new Response("No active batch. POST /run-all first.", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const checkpoints = new Map<string, string>();
      const doneRunIds = new Set<string>();
      for (const runId of runIds) checkpoints.set(runId, "-");

      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // Send a hello so the client can flip from "connecting" to "connected".
      send({ type: "hello", runIds, totalSims: runIds.length });

      // Abort if the client disconnects.
      let aborted = false;
      req.signal.addEventListener("abort", () => {
        aborted = true;
      });

      // Upper bound on SSE lifetime so a wedged worker can't pin a connection
      // open forever. 3 minutes is well over the worst-case 10-sim latency.
      const deadline = Date.now() + 3 * 60 * 1000;

      while (!aborted && doneRunIds.size < runIds.length && Date.now() < deadline) {
        // Read every stream once per tick.
        for (const runId of runIds) {
          if (doneRunIds.has(runId)) continue;
          const lastId = checkpoints.get(runId) ?? "-";
          let entries: Awaited<ReturnType<typeof readEvents>>;
          try {
            entries = await readEvents(runId, lastId);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            send({ type: "stream_error", runId, message });
            continue;
          }
          for (const entry of entries) {
            send(entry.event);
            checkpoints.set(runId, entry.id);
            if (entry.event.type === "done" || entry.event.type === "error") {
              doneRunIds.add(runId);
            }
          }
        }

        if (doneRunIds.size < runIds.length) {
          // Tick pacing. Upstash is HTTP-per-call so we don't want to hammer it.
          await sleep(400);
        }
      }

      send({
        type: "batch_done",
        completed: [...doneRunIds],
        remaining: runIds.filter((r) => !doneRunIds.has(r)),
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
