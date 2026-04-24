import { buildSubgraphSchema } from "@apollo/subgraph";
import gql from "graphql-tag";

export const PROFILE_PORT = 4104;

const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.7", import: ["@key", "@shareable"])

  type Query {
    userProfile(userId: String!): UserProfile
  }

  type UserProfile @shareable {
    userId: String!
    totalScenarios: Int!
    recentCompanies: [String!]!
    recentRoles: [String!]!
  }
`;

/**
 * We call Insforge's PostgREST-compatible REST API directly instead of
 * importing the @insforge/sdk — the SDK's transitive deps don't resolve
 * cleanly under tsx's loader, and this subgraph only needs a simple
 * SELECT. Same creds as the backend.
 */
async function fetchRecentScenarios(userId: string): Promise<
  Array<{ context: { company?: string; jobTitle?: string } }>
> {
  const baseUrl = process.env.INSFORGE_BASE_URL;
  const anonKey = process.env.INSFORGE_ANON_KEY;
  if (!baseUrl || !anonKey) return [];
  // PostgREST query: select context, filter by user_id, order desc, limit 25
  const url = new URL("/api/database/records/scenarios", baseUrl);
  url.searchParams.set("select", "context");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", "25");
  const res = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });
  if (!res.ok) return [];
  try {
    return (await res.json()) as Array<{
      context: { company?: string; jobTitle?: string };
    }>;
  } catch {
    return [];
  }
}

const resolvers = {
  Query: {
    userProfile: async (_: unknown, args: { userId: string }) => {
      const rows = await fetchRecentScenarios(args.userId);
      const companies = new Set<string>();
      const roles = new Set<string>();
      for (const r of rows) {
        if (r.context?.company) companies.add(r.context.company);
        if (r.context?.jobTitle) roles.add(r.context.jobTitle);
      }
      return {
        userId: args.userId,
        totalScenarios: rows.length,
        recentCompanies: [...companies].slice(0, 5),
        recentRoles: [...roles].slice(0, 5),
      };
    },
  },
};

export const profileSchema = buildSubgraphSchema({ typeDefs, resolvers });
