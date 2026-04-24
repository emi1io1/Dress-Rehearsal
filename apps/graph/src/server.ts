import { createServer } from "node:http";
// Node 20.6+ supports --env-file, but for tsx dev we load manually so
// the subgraph process picks up TINYFISH_API_KEY + INSFORGE_* without
// requiring a flag on every invocation.
import "./load-env.js";
import { createYoga } from "graphql-yoga";
import type { GraphQLSchema } from "graphql";
import { SALARY_PORT, salarySchema } from "./subgraphs/salary.js";
import { COMPANY_PORT, companySchema } from "./subgraphs/company.js";
import { INDUSTRY_PORT, industrySchema } from "./subgraphs/industry.js";
import { PROFILE_PORT, profileSchema } from "./subgraphs/profile.js";

/**
 * Runs all 4 subgraphs as separate HTTP endpoints, one per port.
 * The Cosmo Router federates them into a single supergraph at :3002.
 */

type SubgraphSpec = {
  name: string;
  port: number;
  schema: GraphQLSchema;
};

const subgraphs: SubgraphSpec[] = [
  { name: "salary", port: SALARY_PORT, schema: salarySchema },
  { name: "company", port: COMPANY_PORT, schema: companySchema },
  { name: "industry", port: INDUSTRY_PORT, schema: industrySchema },
  { name: "profile", port: PROFILE_PORT, schema: profileSchema },
];

for (const sg of subgraphs) {
  const yoga = createYoga({
    schema: sg.schema,
    graphqlEndpoint: "/graphql",
    landingPage: false,
    logging: "warn",
  });
  const server = createServer(yoga);
  server.listen(sg.port, () => {
    console.log(
      `[graph] ${sg.name.padEnd(10)} http://localhost:${sg.port}/graphql`,
    );
  });
}
