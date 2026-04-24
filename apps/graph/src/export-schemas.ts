import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { printSubgraphSchema } from "@apollo/subgraph";
import type { GraphQLSchema } from "graphql";
import { salarySchema } from "./subgraphs/salary.js";
import { companySchema } from "./subgraphs/company.js";
import { industrySchema } from "./subgraphs/industry.js";
import { profileSchema } from "./subgraphs/profile.js";

/**
 * Dumps each subgraph's SDL to ./schemas/<name>.graphql so `wgc router
 * compose` can read them without the subgraph servers needing to be
 * running. This lets us re-compose the supergraph at build time.
 */

const outDir = path.resolve(process.cwd(), "schemas");

const targets: Array<{ name: string; schema: GraphQLSchema }> = [
  { name: "salary", schema: salarySchema },
  { name: "company", schema: companySchema },
  { name: "industry", schema: industrySchema },
  { name: "profile", schema: profileSchema },
];

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const t of targets) {
    const sdl = printSubgraphSchema(t.schema);
    await writeFile(path.join(outDir, `${t.name}.graphql`), sdl, "utf8");
    console.log(`[graph] wrote schemas/${t.name}.graphql (${sdl.length} chars)`);
  }
}

void main();
