import { createClient, type InsForgeClient } from "@insforge/sdk";

let client: InsForgeClient | null = null;

export function getInsforge(): InsForgeClient {
  if (client) return client;
  const baseUrl = process.env.INSFORGE_BASE_URL;
  const anonKey = process.env.INSFORGE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    throw new Error(
      "INSFORGE_BASE_URL and INSFORGE_ANON_KEY must be set in .env.local (see .env.local.example).",
    );
  }
  client = createClient({ baseUrl, anonKey });
  return client;
}
