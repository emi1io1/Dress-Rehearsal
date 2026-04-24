import { NextResponse } from "next/server";
import { getScenario, getVoiceCall, getVoiceCallByVapiId, updateVoiceCall } from "@/lib/store";
import { getCall, type VapiWebhookEvent } from "@/lib/vapi";
import { scoreVoiceCall } from "@/lib/voice-score";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vapi server-event webhook.
 *
 * Vapi posts events to this URL throughout a call's lifecycle. We only
 * act on `end-of-call-report` (and `status-update` for call_id binding).
 * Everything else gets acknowledged with 200 and ignored.
 *
 * For `end-of-call-report`:
 *   1. Resolve which voice_calls row this belongs to (via metadata.voiceCallId
 *      or via vapi_call_id lookup).
 *   2. Save transcript + duration + ended_reason.
 *   3. Score via Claude. Persist score + goal outcomes + branch points.
 *   4. Mark status=scored.
 *
 * Note: in local dev the webhook won't fire (Vapi can't reach localhost).
 * We also support a manual scoring path via /api/voice-calls/[id]/rescore
 * (not yet implemented — will poll Vapi and score on-demand).
 */
export async function POST(req: Request) {
  let payload: { message?: VapiWebhookEvent; [k: string]: unknown };
  try {
    payload = (await req.json()) as { message?: VapiWebhookEvent };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload.message ?? (payload as unknown as VapiWebhookEvent);
  if (!event || typeof event !== "object" || !("type" in event)) {
    return NextResponse.json({ ok: true, ignored: "no-type" });
  }

  const eventType = String((event as { type: unknown }).type);

  // Status updates — record Vapi call ID binding early so we can correlate
  // late events even if the metadata didn't propagate.
  if (eventType === "status-update") {
    const e = event as Extract<VapiWebhookEvent, { type: "status-update" }>;
    const vapiCallId = e.call?.id;
    const metaVoiceCallId = (e.call?.metadata ?? {})["voiceCallId"];
    if (metaVoiceCallId && vapiCallId) {
      const row = await getVoiceCall(metaVoiceCallId);
      if (row && row.vapiCallId !== vapiCallId) {
        await updateVoiceCall(row.id, {
          vapiCallId,
          status: e.status === "ended" ? "ended" : "in_progress",
        });
      }
    }
    return NextResponse.json({ ok: true, observed: "status-update" });
  }

  if (eventType !== "end-of-call-report") {
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  // End-of-call: fetch, persist, score.
  const e = event as Extract<VapiWebhookEvent, { type: "end-of-call-report" }>;
  const vapiCallId = e.call?.id;
  const metaVoiceCallId = (e.call?.metadata ?? {})["voiceCallId"];

  let row = metaVoiceCallId ? await getVoiceCall(metaVoiceCallId) : null;
  if (!row && vapiCallId) {
    row = await getVoiceCallByVapiId(vapiCallId);
  }
  if (!row) {
    console.warn("[vapi webhook] no matching voice_calls row", { vapiCallId, metaVoiceCallId });
    return NextResponse.json({ ok: true, ignored: "no-match" });
  }

  // Vapi includes transcript in the event, but a follow-up GET /call/:id
  // is the canonical source (transcript is sometimes partial in the webhook).
  let transcript = e.transcript ?? e.call?.transcript ?? "";
  let durationSec: number | null = null;
  let endedReason = e.call?.endedReason ?? null;
  try {
    if (vapiCallId) {
      const full = await getCall(vapiCallId);
      transcript = full.transcript ?? transcript;
      if (full.startedAt && full.endedAt) {
        durationSec = Math.round(
          (new Date(full.endedAt).getTime() - new Date(full.startedAt).getTime()) / 1000,
        );
      }
      endedReason = full.endedReason ?? endedReason;
    }
  } catch (err: unknown) {
    console.warn("[vapi webhook] GET /call failed", err instanceof Error ? err.message : err);
  }

  await updateVoiceCall(row.id, {
    transcript,
    durationSec,
    endedReason,
    endedAt: new Date().toISOString(),
    status: "ended",
    vapiCallId: vapiCallId ?? row.vapiCallId ?? null,
  });

  if (!transcript || transcript.length < 40) {
    await updateVoiceCall(row.id, { status: "scored", outcomeScore: 0, summary: "Transcript too short to score." });
    return NextResponse.json({ ok: true, scored: false, reason: "transcript-too-short" });
  }

  const scenario = await getScenario(row.scenarioId);
  if (!scenario) {
    return NextResponse.json({ ok: true, scored: false, reason: "scenario-missing" });
  }

  try {
    const scored = await scoreVoiceCall({
      scenario,
      transcript,
      archetypeDisplayName: row.archetypeDisplayName,
      durationSec,
    });
    await updateVoiceCall(row.id, {
      outcomeScore: scored.outcomeScore,
      summary: scored.summary,
      goalOutcomes: scored.goalOutcomes,
      branchPoints: scored.branchPoints,
      status: "scored",
    });
    return NextResponse.json({ ok: true, scored: true, outcomeScore: scored.outcomeScore });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await updateVoiceCall(row.id, { status: "error" });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
