import { NextResponse } from "next/server";
import { getRegistryEntry } from "@rehearsal/agents";
import { RUN_PROFILE } from "@/lib/personas";
import { getScenario, createVoiceCall, updateVoiceCall } from "@/lib/store";
import { buildVoiceAssistant } from "@/lib/voice-assistant";
import { createAssistant, hasVapiKey } from "@/lib/vapi";
import type { RunType } from "@rehearsal/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { runType?: RunType; archetypeId?: string };

/**
 * Phase 9: prepare a voice rehearsal.
 *
 * Flow:
 *   1. Load scenario (must exist).
 *   2. Resolve which Guild archetype to use (explicit or based on runType).
 *   3. Create a Vapi Assistant with the persona's system prompt + grounding
 *      + federated context + voice.
 *   4. Persist a `voice_calls` row in `prepared` status with the assistant ID.
 *   5. Return { voiceCallId, assistantId } so the frontend's Vapi Web SDK
 *      can start the call.
 *
 * The real call happens in the browser. When it ends, /api/vapi/webhook
 * receives the report and scores it.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!hasVapiKey()) {
    return NextResponse.json(
      { error: "VAPI_PRIVATE_KEY is not set on the backend." },
      { status: 503 },
    );
  }

  const scenario = await getScenario(id);
  if (!scenario) return NextResponse.json({ error: "Scenario not found" }, { status: 404 });

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // empty body OK
  }
  const runType: RunType = body.runType ?? "likely";
  const archetypeId = body.archetypeId ?? RUN_PROFILE[runType].archetypeId;
  const entry = getRegistryEntry(archetypeId);
  if (!entry) {
    return NextResponse.json({ error: `Unknown archetype ${archetypeId}` }, { status: 400 });
  }

  // Reserve a voice_calls row first — we need its ID for Vapi metadata so the
  // webhook can correlate the call back to our record.
  const voiceCall = await createVoiceCall({
    scenarioId: scenario.id,
    runType,
    archetypeId: entry.archetypeId,
    archetypeDisplayName: entry.displayName,
    guildAgentId: entry.guildAgentId,
    guildAgentVersion: entry.guildVersion,
    vapiAssistantId: null,
  });

  try {
    const webhookUrl = process.env.VAPI_WEBHOOK_URL;
    const assistant = await createAssistant(
      buildVoiceAssistant({
        scenario,
        runType,
        archetypeId,
        serverUrl: webhookUrl || undefined,
        voiceCallId: voiceCall.id,
      }),
    );

    const updated = await updateVoiceCall(voiceCall.id, {
      vapiAssistantId: assistant.id,
    });

    return NextResponse.json({
      voiceCall: updated ?? voiceCall,
      assistantId: assistant.id,
      webhookConfigured: Boolean(webhookUrl),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await updateVoiceCall(voiceCall.id, { status: "error" });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
