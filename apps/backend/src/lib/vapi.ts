/**
 * Thin client for Vapi's REST API — create assistants, fetch calls, parse webhooks.
 *
 * Docs: https://docs.vapi.ai
 * Auth: Bearer <VAPI_PRIVATE_KEY>
 */

const VAPI_BASE = "https://api.vapi.ai";

export type VapiVoice = {
  provider: "11labs" | "playht" | "openai" | "deepgram" | "vapi" | "cartesia";
  voiceId: string;
};

export type VapiModel = {
  provider: "openai" | "anthropic" | "groq" | "google";
  model: string;
  temperature?: number;
  maxTokens?: number;
};

export type CreateAssistantBody = {
  name: string;
  model: VapiModel & {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  };
  voice: VapiVoice;
  firstMessage: string;
  serverUrl?: string;          // webhook URL for server events
  endCallPhrases?: string[];   // phrases that tell the assistant the call should end
  silenceTimeoutSeconds?: number;
  maxDurationSeconds?: number;
  metadata?: Record<string, string>;
};

export type VapiAssistant = {
  id: string;
  orgId: string;
  createdAt: string;
  name: string;
};

export type VapiCall = {
  id: string;
  status: "queued" | "ringing" | "in-progress" | "forwarding" | "ended";
  assistantId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  transcript: string | null;           // full text transcript, may be null until call ends
  messages: Array<{
    role: "user" | "bot" | "system" | "function_call" | "function_result";
    message?: string;
    time?: number;
    secondsFromStart?: number;
  }> | null;
  summary: string | null;
  cost: number | null;
  metadata: Record<string, string> | null;
};

export type VapiWebhookEvent =
  | {
      type: "end-of-call-report";
      call: VapiCall;
      timestamp: string;
      summary?: string;
      transcript?: string;
      messages?: VapiCall["messages"];
    }
  | {
      type: "status-update";
      call: VapiCall;
      status: VapiCall["status"];
      timestamp: string;
    }
  | {
      type: "transcript";
      call: { id: string };
      role: "user" | "assistant";
      transcriptType: "partial" | "final";
      transcript: string;
    }
  | { type: string; [k: string]: unknown }; // catch-all for event types we don't handle

export function hasVapiKey(): boolean {
  return Boolean(process.env.VAPI_PRIVATE_KEY);
}

async function vapiFetch<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const key = process.env.VAPI_PRIVATE_KEY;
  if (!key) throw new Error("VAPI_PRIVATE_KEY not set");

  const res = await fetch(`${VAPI_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vapi ${method} ${path} ${res.status}: ${text.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

export async function createAssistant(body: CreateAssistantBody): Promise<VapiAssistant> {
  return vapiFetch<VapiAssistant>("POST", "/assistant", body);
}

export async function getCall(callId: string): Promise<VapiCall> {
  return vapiFetch<VapiCall>("GET", `/call/${callId}`);
}

export async function listCallsByAssistant(assistantId: string, limit = 10): Promise<VapiCall[]> {
  return vapiFetch<VapiCall[]>(
    "GET",
    `/call?assistantId=${encodeURIComponent(assistantId)}&limit=${limit}`,
  );
}

export async function deleteAssistant(assistantId: string): Promise<void> {
  await vapiFetch<unknown>("DELETE", `/assistant/${assistantId}`);
}
