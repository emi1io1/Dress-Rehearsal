import { buildSubgraphSchema } from "@apollo/subgraph";
import gql from "graphql-tag";

export const COMPANY_PORT = 4102;

const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.7", import: ["@key", "@shareable"])

  type Query {
    company(name: String!): Company
  }

  type Company @shareable {
    name: String!
    aliases: [String!]!
    industry: String!
    stage: Stage!
    employeeRange: String!
    headquarters: String!
    # Float — Int overflows for companies at $10B+ funding
    recentFundingUSD: Float
    publicCompany: Boolean!
    notableProducts: [String!]!
  }

  enum Stage {
    SEED
    SERIES_A
    SERIES_B
    SERIES_C
    GROWTH
    LATE_STAGE
    PUBLIC
  }
`;

type Row = {
  canonical: string;
  aliases: string[];
  industry: string;
  stage: "SEED" | "SERIES_A" | "SERIES_B" | "SERIES_C" | "GROWTH" | "LATE_STAGE" | "PUBLIC";
  employeeRange: string;
  headquarters: string;
  recentFundingUSD?: number;
  publicCompany: boolean;
  notableProducts: string[];
};

const TABLE: Row[] = [
  {
    canonical: "Anthropic",
    aliases: ["anthropic"],
    industry: "AI research & foundation models",
    stage: "LATE_STAGE",
    employeeRange: "1000-2500",
    headquarters: "San Francisco, CA",
    recentFundingUSD: 40_000_000_000,
    publicCompany: false,
    notableProducts: ["Claude", "Claude Code", "Constitutional AI research"],
  },
  {
    canonical: "Stripe",
    aliases: ["stripe", "stripe inc"],
    industry: "Payments infrastructure",
    stage: "LATE_STAGE",
    employeeRange: "7000-8000",
    headquarters: "San Francisco, CA / Dublin",
    recentFundingUSD: 6_500_000_000,
    publicCompany: false,
    notableProducts: ["Stripe Payments", "Stripe Terminal", "Stripe Atlas"],
  },
  {
    canonical: "Shopify",
    aliases: ["shopify", "shopify inc"],
    industry: "E-commerce platform",
    stage: "PUBLIC",
    employeeRange: "8000-10000",
    headquarters: "Ottawa, Canada",
    publicCompany: true,
    notableProducts: ["Shopify Admin", "Shop Pay", "Shopify Apps"],
  },
  {
    canonical: "OpenAI",
    aliases: ["openai"],
    industry: "AI research & foundation models",
    stage: "LATE_STAGE",
    employeeRange: "3000-5000",
    headquarters: "San Francisco, CA",
    recentFundingUSD: 30_000_000_000,
    publicCompany: false,
    notableProducts: ["ChatGPT", "GPT-5", "Sora"],
  },
  {
    canonical: "Google",
    aliases: ["google", "alphabet", "google llc"],
    industry: "Consumer + cloud + AI",
    stage: "PUBLIC",
    employeeRange: "180000+",
    headquarters: "Mountain View, CA",
    publicCompany: true,
    notableProducts: ["Search", "Google Cloud", "Gemini", "YouTube"],
  },
  {
    canonical: "Meta",
    aliases: ["meta", "facebook", "meta platforms"],
    industry: "Social + ads + reality labs",
    stage: "PUBLIC",
    employeeRange: "70000+",
    headquarters: "Menlo Park, CA",
    publicCompany: true,
    notableProducts: ["Facebook", "Instagram", "WhatsApp", "Llama"],
  },
  {
    canonical: "Figma",
    aliases: ["figma"],
    industry: "Design collaboration SaaS",
    stage: "PUBLIC",
    employeeRange: "1500-2000",
    headquarters: "San Francisco, CA",
    publicCompany: true,
    notableProducts: ["Figma Design", "FigJam", "Dev Mode"],
  },
  {
    canonical: "Notion",
    aliases: ["notion", "notion labs"],
    industry: "Productivity SaaS",
    stage: "GROWTH",
    employeeRange: "800-1200",
    headquarters: "San Francisco, CA",
    recentFundingUSD: 275_000_000,
    publicCompany: false,
    notableProducts: ["Notion Docs", "Notion Calendar", "Notion AI"],
  },
  {
    canonical: "Vercel",
    aliases: ["vercel", "vercel inc"],
    industry: "Developer platform / frontend infra",
    stage: "GROWTH",
    employeeRange: "500-700",
    headquarters: "San Francisco, CA",
    recentFundingUSD: 250_000_000,
    publicCompany: false,
    notableProducts: ["Vercel platform", "Next.js", "v0"],
  },
];

const resolvers = {
  Query: {
    company: (_: unknown, args: { name: string }) => {
      const q = args.name.toLowerCase().trim();
      const row = TABLE.find((r) => r.aliases.includes(q) || r.canonical.toLowerCase() === q);
      if (!row) return null;
      return {
        name: row.canonical,
        aliases: row.aliases,
        industry: row.industry,
        stage: row.stage,
        employeeRange: row.employeeRange,
        headquarters: row.headquarters,
        recentFundingUSD: row.recentFundingUSD ?? null,
        publicCompany: row.publicCompany,
        notableProducts: row.notableProducts,
      };
    },
  },
};

export const companySchema = buildSubgraphSchema({ typeDefs, resolvers });
