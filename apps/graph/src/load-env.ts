import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal .env.local loader so the subgraph process has access to
 * TINYFISH_API_KEY and INSFORGE_* without requiring dotenv as a dep.
 */
const path = resolve(process.cwd(), ".env.local");
try {
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  // .env.local not found — proceed with whatever's in the shell env
}
