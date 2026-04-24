import { buildSubgraphSchema } from "@apollo/subgraph";
import gql from "graphql-tag";

export const INDUSTRY_PORT = 4103;

const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.7", import: ["@key", "@shareable"])

  type Query {
    industrySignals(query: String!, limit: Int = 5): [IndustrySignal!]!
  }

  type IndustrySignal @shareable {
    title: String!
    snippet: String!
    url: String!
    siteName: String
    position: Int!
  }
`;

const TINYFISH_URL = "https://api.search.tinyfish.ai";

type TFResult = {
  position: number;
  site_name: string;
  title: string;
  snippet: string;
  url: string;
};

type TFResponse = {
  results: TFResult[];
};

async function tinyfishSearch(query: string): Promise<TFResult[]> {
  const key = process.env.TINYFISH_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({ query, location: "US", language: "en" });
  const res = await fetch(`${TINYFISH_URL}?${params.toString()}`, {
    headers: { "X-API-Key": key },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as TFResponse;
  return body.results ?? [];
}

const resolvers = {
  Query: {
    industrySignals: async (
      _: unknown,
      args: { query: string; limit?: number },
    ) => {
      const raw = await tinyfishSearch(args.query);
      const limit = args.limit ?? 5;
      return raw.slice(0, limit).map((r) => ({
        title: r.title,
        snippet: r.snippet,
        url: r.url,
        siteName: r.site_name || null,
        position: r.position,
      }));
    },
  },
};

export const industrySchema = buildSubgraphSchema({ typeDefs, resolvers });
