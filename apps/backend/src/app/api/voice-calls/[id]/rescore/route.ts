import { NextResponse } from "next/server";
import {
  getScenario,
  getVoiceCall,
  updateVoiceCall,
} from "@/lib/store";
import { getCall, hasVapiKey, listCallsByAssistant } from "@/lib/vapi";
import { scoreVoiceCall } from "@/lib/voice-score";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = { vapiCallId?: string };

/**
 * Manual scoring trigger. Useful in local dev where the webhook can't fire.
 *
 * Resolution order for the Vapi call ID:
 *   1. body.vapiCallId (explicit override — paste from Vapi dashboard)
 *   2. voice_calls.vapi_call_id (set by a prior webhook status-update)
 *   3. list Vapi's calls filtered by assistantId, pick the most recent whose
 *      metadata.voiceCallId matches our row (works for dashboard "Talk to
 *      Assistant" flows — Vapi carries our metadata through)
 *
 * Once resolved, fetch the call, save transcript, run the scorer.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!hasVapiKey()) {
    return NextResponse.json({ error: "VAPI_PRIVATE_KEY missing" }, { status: 503 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // empty body OK
  }

  const row = await getVoiceCall(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  let vapiCallId = body.vapiCallId ?? row.vapiCallId ?? null;
  if (!vapiCallId && row.vapiAssistantId) {
    try {
      const recent = await listCallsByAssistant(row.vapiAssistantId, 10);
      const match = recent.find((c) => {
        const meta = c.metadata ?? {};
        return meta["voiceCallId"] === row.id;
      });
      vapiCallId = match?.id ?? recent[0]?.id ?? null;
    } catch (err: unknown) {
      console.warn(
        "[rescore] listCallsByAssistant failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (!vapiCallId) {
    return NextResponse.json(
      {
        error:
          "couldn't resolve vapi_call_id — start a call against this assistant first, then retry (or pass { vapiCallId } in the body)",
      },
      { status: 409 },
    );
  }

  if (!row.vapiCallId || row.vapiCallId !== vapiCallId) {
    await updateVoiceCall(row.id, { vapiCallId });
  }

  const scenario = await getScenario(row.scenarioId);
  if (!scenario) return NextResponse.json({ error: "scenario missing" }, { status: 404 });

  const call = await getCall(vapiCallId);
  if (call.status !== "ended") {
    return NextResponse.json({ error: `call still ${call.status}` }, { status: 409 });
  }

  const transcript = call.transcript ?? "";
  const durationSec =
    call.startedAt && call.endedAt
      ? Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)
      : null;

  await updateVoiceCall(row.id, {
    transcript,
    durationSec,
    endedReason: call.endedReason ?? null,
    endedAt: call.endedAt ?? new Date().toISOString(),
    status: "ended",
  });

  if (!transcript || transcript.length < 40) {
    const updated = await updateVoiceCall(row.id, {
      status: "scored",
      outcomeScore: 0,
      summary: "Transcript too short to score.",
    });
    return NextResponse.json({ voiceCall: updated, scored: false });
  }

  const scored = await scoreVoiceCall({
    scenario,
    transcript,
    archetypeDisplayName: row.archetypeDisplayName,
    durationSec,
  });
  const updated = await updateVoiceCall(row.id, {
    outcomeScore: scored.outcomeScore,
    summary: scored.summary,
    goalOutcomes: scored.goalOutcomes,
    branchPoints: scored.branchPoints,
    status: "scored",
  });
  return NextResponse.json({ voiceCall: updated, scored: true });
}
