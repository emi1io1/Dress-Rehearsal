import { buildSubgraphSchema } from "@apollo/subgraph";
import gql from "graphql-tag";

export const SALARY_PORT = 4101;

const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.7", import: ["@key", "@shareable"])

  type Query {
    salaryBenchmark(
      jobTitle: String!
      company: String
      yearsExperience: Int
    ): SalaryBenchmark
  }

  type SalaryBenchmark @shareable {
    jobTitle: String!
    company: String
    # base salary percentiles in USD
    p25: Int!
    p50: Int!
    p75: Int!
    p90: Int!
    equitySignalUSD: Int
    currency: String!
    source: String!
    lastUpdated: String!
  }
`;

/**
 * Mock salary table modeled after Levels.fyi-style data.
 * Hackathon scope: ~20 well-known companies × a few senior roles.
 */
type Row = {
  title: string;
  company?: string;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  equityUSD?: number;
};

const TABLE: Row[] = [
  // Senior/Staff SWE
  { title: "senior software engineer", company: "anthropic", p25: 320000, p50: 395000, p75: 470000, p90: 550000, equityUSD: 180000 },
  { title: "senior software engineer", company: "stripe", p25: 260000, p50: 320000, p75: 380000, p90: 440000, equityUSD: 150000 },
  { title: "senior software engineer", company: "google", p25: 250000, p50: 310000, p75: 370000, p90: 430000, equityUSD: 160000 },
  { title: "senior software engineer", company: "shopify", p25: 210000, p50: 260000, p75: 310000, p90: 360000, equityUSD: 90000 },
  { title: "senior software engineer", p25: 200000, p50: 245000, p75: 295000, p90: 350000, equityUSD: 80000 },
  { title: "staff software engineer", company: "anthropic", p25: 410000, p50: 510000, p75: 600000, p90: 720000, equityUSD: 300000 },
  { title: "staff software engineer", company: "stripe", p25: 320000, p50: 395000, p75: 460000, p90: 540000, equityUSD: 210000 },
  { title: "staff software engineer", p25: 290000, p50: 355000, p75: 420000, p90: 490000, equityUSD: 150000 },
  // Research / ML
  { title: "senior research engineer", company: "anthropic", p25: 340000, p50: 420000, p75: 500000, p90: 620000, equityUSD: 220000 },
  { title: "senior research engineer", p25: 290000, p50: 360000, p75: 430000, p90: 510000, equityUSD: 140000 },
  { title: "senior machine learning engineer", p25: 260000, p50: 320000, p75: 390000, p90: 460000, equityUSD: 130000 },
  { title: "senior machine learning engineer", company: "openai", p25: 340000, p50: 420000, p75: 510000, p90: 620000, equityUSD: 250000 },
  // PM
  { title: "senior product manager", p25: 220000, p50: 275000, p75: 330000, p90: 390000, equityUSD: 110000 },
  { title: "staff product manager", p25: 290000, p50: 355000, p75: 420000, p90: 490000, equityUSD: 170000 },
  // Design
  { title: "senior product designer", p25: 195000, p50: 240000, p75: 285000, p90: 330000, equityUSD: 80000 },
  // Data
  { title: "senior data scientist", p25: 215000, p50: 265000, p75: 320000, p90: 375000, equityUSD: 90000 },
];

const resolvers = {
  Query: {
    salaryBenchmark: (
      _: unknown,
      args: { jobTitle: string; company?: string; yearsExperience?: number },
    ) => {
      const title = args.jobTitle.toLowerCase().trim();
      const company = args.company?.toLowerCase().trim();
      // Prefer exact (title, company) match, then title-only, then fuzzy title contains
      const exact = TABLE.find(
        (r) => r.title === title && company && r.company === company,
      );
      const titleOnly = TABLE.find((r) => r.title === title && !r.company);
      const fuzzy = TABLE.find((r) => title.includes(r.title) && !r.company);
      const row = exact ?? titleOnly ?? fuzzy ?? null;
      if (!row) return null;
      return {
        jobTitle: args.jobTitle,
        company: args.company ?? null,
        p25: row.p25,
        p50: row.p50,
        p75: row.p75,
        p90: row.p90,
        equitySignalUSD: row.equityUSD ?? null,
        currency: "USD",
        source: "mock-levels-fyi",
        lastUpdated: "2026-04-24",
      };
    },
  },
};

export const salarySchema = buildSubgraphSchema({ typeDefs, resolvers });
