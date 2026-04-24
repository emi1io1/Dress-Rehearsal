import type { FederatedContext } from "@rehearsal/types";

/**
 * Fetches the federated context for a scenario via one GraphQL query to the
 * Cosmo Router. The router fans out to all 4 subgraphs (salary, company,
 * industry, profile) and stitches the result. If the router is unreachable
 * or any subgraph fails, we fail soft and return null — the batch still
 * runs, just without the federated section in the prompt.
 */

const ROUTER_URL = process.env.COSMO_ROUTER_URL ?? "http://localhost:3002/graphql";

const QUERY = `
  query Context($jobTitle: String!, $company: String!, $industryQuery: String!, $userId: String!) {
    salary: salaryBenchmark(jobTitle: $jobTitle, company: $company) {
      jobTitle
      company
      p25 p50 p75 p90
      equitySignalUSD
      currency
      source
      lastUpdated
    }
    company(name: $company) {
      name
      aliases
      industry
      stage
      employeeRange
      headquarters
      recentFundingUSD
      publicCompany
      notableProducts
    }
    industrySignals(query: $industryQuery, limit: 5) {
      title
      snippet
      url
      siteName
      position
    }
    profile: userProfile(userId: $userId) {
      userId
      totalScenarios
      recentCompanies
      recentRoles
    }
  }
`;

type GqlResp = {
  data?: {
    salary: FederatedContext["salary"];
    company: FederatedContext["company"];
    industrySignals: FederatedContext["industrySignals"];
    profile: FederatedContext["profile"];
  };
  errors?: Array<{ message: string }>;
};

export async function fetchFederatedContext(input: {
  jobTitle: string;
  company: string;
  userId: string;
}): Promise<FederatedContext | null> {
  const industryQuery = `${input.company} ${input.jobTitle} industry outlook 2026`;

  let resp: Response;
  try {
    resp = await fetch(ROUTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          jobTitle: input.jobTitle,
          company: input.company,
          industryQuery,
          userId: input.userId,
        },
      }),
    });
  } catch (err: unknown) {
    console.warn(
      "[graph] Cosmo router unreachable; skipping federated context:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  if (!resp.ok) {
    console.warn("[graph] Cosmo router returned", resp.status);
    return null;
  }

  const body = (await resp.json()) as GqlResp;
  if (body.errors?.length) {
    // Partial data is still useful. Log but don't fail.
    console.warn(
      "[graph] Cosmo subgraph errors:",
      body.errors.map((e) => e.message).join(" · "),
    );
  }

  const d = body.data;
  if (!d) return null;

  return {
    salary: d.salary ?? null,
    company: d.company ?? null,
    industrySignals: d.industrySignals ?? [],
    profile: d.profile ?? null,
    generatedAt: new Date().toISOString(),
  };
}
