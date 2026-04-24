import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAgents } from "./registry";

/**
 * Publish every registered archetype agent to Guild Hub.
 *
 *   prerequisites:
 *     1. `npx guild auth login` (one-time, browser OAuth)
 *     2. `npm install @guildai/agents-sdk @guildai/cli` in apps/agents
 *
 * What it does, per archetype:
 *   1. Generates a self-contained Guild agent package at `build/<archetypeId>/`
 *      — includes a `package.json`, `agent.ts`, and a copy of the shared
 *      simulation logic so the published agent runs standalone on Guild's
 *      platform.
 *   2. Runs `guild agent save --publish` from that directory.
 *   3. Parses the returned agent ID + version and writes it to
 *      `apps/agents/published.json`, which the backend reads to stamp every
 *      simulation_run with the canonical Guild identity.
 *
 * NOTE: this script is written to be defensive. If `guild` CLI isn't
 * installed or auth is missing, it prints a clear remediation message
 * rather than half-publishing.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.resolve(HERE, "..", "build");
const PUBLISHED_FILE = path.resolve(HERE, "..", "published.json");

type PublishedRecord = {
  guildAgentId: string | null;
  version: string | null;
  publishedAt: string | null;
  hubUrl: string | null;
};

async function checkGuildCli(): Promise<void> {
  try {
    await run("npx", ["guild", "--version"], { quiet: true });
  } catch {
    throw new Error(
      "`guild` CLI not available. Run `npm install -D @guildai/cli` in apps/agents first.",
    );
  }
}

async function ensureAuth(): Promise<void> {
  try {
    await run("npx", ["guild", "auth", "status"], { quiet: true });
  } catch {
    throw new Error(
      "Not authenticated with Guild. Run `npx guild auth login` in apps/agents first.",
    );
  }
}

async function generateAgentPackage(archetypeId: string, displayName: string, description: string) {
  const dir = path.join(BUILD_DIR, archetypeId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  // Copy the shared runtime so the published agent is self-contained.
  const sharedSrc = path.resolve(HERE, "shared");
  const sharedDst = path.join(dir, "shared");
  await cp(sharedSrc, sharedDst, { recursive: true });
  // Copy the archetype's own file.
  const archetypeSrc = path.join(HERE, "archetypes", `${archetypeId.replace(/_/g, "-")}.ts`);
  await cp(archetypeSrc, path.join(dir, "archetype.ts"));
  // Minimal agent entry.
  await writeFile(
    path.join(dir, "agent.ts"),
    `import { agent as guildAgent } from "@guildai/agents-sdk";
import { z } from "zod";
import { metadata, run } from "./archetype";

const ScenarioSchema = z.any();

export default guildAgent({
  description: ${JSON.stringify(description)},
  inputSchema: z.object({
    scenario: ScenarioSchema,
    runType: z.enum(["best", "likely", "worst"]),
  }),
  outputSchema: z.object({
    curveballs: z.array(z.any()),
    gapAnalysis: z.any(),
    criticalMoment: z.any().nullable(),
    outcome: z.any(),
  }),
  run: async (task) => run(task.input),
});
`,
    "utf8",
  );
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: `rehearsal-${archetypeId.replace(/_/g, "-")}`,
        version: "1.0.0",
        private: true,
        type: "module",
        main: "agent.ts",
        dependencies: {
          "@guildai/agents-sdk": "*",
          "@anthropic-ai/sdk": "^0.91.0",
          zod: "^4.3.6",
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  return dir;
}

async function publishOne(dir: string, archetypeId: string): Promise<PublishedRecord> {
  process.stdout.write(`\n[publish] ${archetypeId}\n`);
  const output = await run(
    "npx",
    ["guild", "agent", "save", "--message", `Publish ${archetypeId}`, "--wait", "--publish"],
    { cwd: dir, quiet: false },
  );

  const idMatch = output.match(/agent[-_ ]id[:\s]+([a-zA-Z0-9_-]+)/i);
  const versionMatch = output.match(/version[:\s]+v?([\d.]+)/i);
  const urlMatch = output.match(/https?:\/\/[^\s]*guild[^\s]*/i);
  return {
    guildAgentId: idMatch?.[1] ?? null,
    version: versionMatch?.[1] ?? null,
    publishedAt: new Date().toISOString(),
    hubUrl: urlMatch?.[0] ?? null,
  };
}

async function updatePublishedFile(updates: Record<string, PublishedRecord>): Promise<void> {
  const current = JSON.parse(await readFile(PUBLISHED_FILE, "utf8")) as Record<string, PublishedRecord>;
  for (const [k, v] of Object.entries(updates)) current[k] = v;
  await writeFile(PUBLISHED_FILE, JSON.stringify(current, null, 2) + "\n", "utf8");
}

async function main() {
  await checkGuildCli();
  await ensureAuth();

  const agents = listAgents();
  console.log(`[publish] publishing ${agents.length} archetype agent(s)`);
  const updates: Record<string, PublishedRecord> = {};
  for (const a of agents) {
    const dir = await generateAgentPackage(a.metadata.archetypeId, a.metadata.displayName, a.metadata.description);
    try {
      const record = await publishOne(dir, a.metadata.archetypeId);
      updates[a.metadata.archetypeId] = record;
      console.log(`  ✓ ${a.metadata.archetypeId} → ${record.guildAgentId ?? "(id not parsed)"}`);
    } catch (err: unknown) {
      console.error(`  ✗ ${a.metadata.archetypeId}: ${err instanceof Error ? err.message : err}`);
    }
  }
  await updatePublishedFile(updates);
  console.log(`\n[publish] updated published.json — backend will now stamp sims with Guild IDs.`);
}

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; quiet?: boolean } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: opts.quiet ? "pipe" : ["inherit", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      if (!opts.quiet) process.stdout.write(s);
    });
    child.stderr?.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      if (!opts.quiet) process.stderr.write(s);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}\n${stderr}`));
    });
    child.on("error", reject);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
