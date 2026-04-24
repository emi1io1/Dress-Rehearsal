export type RunType = "best" | "likely" | "worst";

export type ScenarioType = "job_interview";

export type ScenarioContext = {
  jobTitle: string;
  company: string;
  jobDescription: string;
  userSkills: string;
  salaryExpectation: string;
  otherContext: string;
};

export type GroundingSource = {
  title: string;
  url: string;
  siteName: string | null;
};

export type Grounding = {
  newsItems: string[];        // bullets about recent moves, funding, product launches
  cultureSignals: string[];   // bullets from Glassdoor / reviews on interview style + culture
  recentEvents: string[];     // bullets on layoffs, reorgs, strategic shifts
  interviewFocus: string[];   // topics this company's interviews consistently probe
  sources: GroundingSource[]; // audit trail — links the UI can display
  generatedAt: string;
};

// Federated context pulled from the Cosmo supergraph (salary + company + industry + profile).
export type FederatedSalary = {
  jobTitle: string;
  company: string | null;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  equitySignalUSD: number | null;
  currency: string;
  source: string;
  lastUpdated: string;
};

export type FederatedCompany = {
  name: string;
  aliases: string[];
  industry: string;
  stage:
    | "SEED"
    | "SERIES_A"
    | "SERIES_B"
    | "SERIES_C"
    | "GROWTH"
    | "LATE_STAGE"
    | "PUBLIC";
  employeeRange: string;
  headquarters: string;
  recentFundingUSD: number | null;
  publicCompany: boolean;
  notableProducts: string[];
};

export type FederatedIndustrySignal = {
  title: string;
  snippet: string;
  url: string;
  siteName: string | null;
  position: number;
};

export type FederatedUserProfile = {
  userId: string;
  totalScenarios: number;
  recentCompanies: string[];
  recentRoles: string[];
};

export type FederatedContext = {
  salary: FederatedSalary | null;
  company: FederatedCompany | null;
  industrySignals: FederatedIndustrySignal[];
  profile: FederatedUserProfile | null;
  generatedAt: string;
};

export type Scenario = {
  id: string;
  userId: string;
  scenarioType: ScenarioType;
  context: ScenarioContext;
  counterpartyInfo: string;
  userGoals: string[];
  grounding: Grounding | null;
  federatedContext: FederatedContext | null;
  createdAt: string;
};

export type CurveballCategory =
  | "resume_gap"
  | "role_requirement"
  | "company_specific"
  | "values_probe"
  | "technical_depth";

export type CurveballRisk = "HIGH" | "MEDIUM" | "LOW";

export type Curveball = {
  id: string;              // stable ref for expand/collapse in UI
  question: string;
  reason: string;          // why an interviewer would ask this
  category: CurveballCategory;
  risk: CurveballRisk;
};

export type GapAnalysis = {
  unaddressed: string[];   // 🔴 questions context doesn't answer
  weak: string[];          // 🟡 thin / unsupported
  strong: string[];        // 🟢 specific and defensible
};

export type CriticalMoment = {
  curveballId: string;
  interviewerLine: string;
  userProxyLine: string;   // constrained to user's stated context
  failureMode: string | null; // "Your context does not cover this" etc.
  handled: boolean;
};

export type GoalAchievement = "achieved" | "partial" | "missed";

export type Outcome = {
  goalAchievement: Array<{ goal: string; result: GoalAchievement }>;
  salaryOutcome: string | null;   // e.g. "Came in $30k below ask" or null if N/A
  roleFit: "strong" | "mixed" | "weak";
  summary: string;                 // 2-3 sentence bottom-line
};

export type SimulationRun = {
  id: string;
  scenarioId: string;
  runType: RunType;
  personaArchetype: string;        // archetype id, e.g. "hard_negotiator"
  archetypeName: string;           // display name, e.g. "Hard Negotiator"
  archetypeCodeVersion: string | null; // the semver from the TS metadata at run time
  guildAgentId: string | null;     // from Guild Hub if the agent has been published
  guildAgentVersion: string | null;
  curveballs: Curveball[];
  gapAnalysis: GapAnalysis;
  criticalMoment: CriticalMoment | null;
  outcome: Outcome | null;
  status: "pending" | "running" | "complete" | "error";
  error?: string;
  createdAt: string;
};

/**
 * Audit-log row for every agent invocation. One per simulation_run.
 * Persists identity + inputs + outputs so a future inspector can
 * reconstruct why a persona behaved the way it did on a given run.
 */
export type AgentRun = {
  id: string;
  simulationRunId: string;
  archetypeId: string;
  guildAgentId: string | null;
  guildAgentVersion: string | null;
  archetypeCodeVersion: string;
  archetypeDisplayName: string;
  scopedSubgraphs: string[];
  inputDigest: {
    scenarioId: string;
    company: string;
    jobTitle: string;
    runType: RunType;
    goalCount: number;
    groundingPresent: boolean;
    federatedPresent: boolean;
  };
  outputDigest: {
    curveballCount: number;
    highRiskCount: number;
    handled: boolean | null;
    roleFit: Outcome["roleFit"] | null;
  } | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

export type Iteration = {
  id: string;
  scenarioId: string;
  iterationNumber: number;
  userAdditions: string;
  confidenceScore: number;
  createdAt: string;
};

export type VoiceCallStatus =
  | "prepared"       // assistant created, client hasn't connected yet
  | "in_progress"    // live call
  | "ended"          // call ended, awaiting transcript/score
  | "scored"         // scoring pass complete
  | "error";

export type VoiceCallGoalOutcome = {
  goal: string;
  result: GoalAchievement;
  evidence: string | null;
};

export type VoiceCallBranchPoint = {
  secondsFromStart: number | null;
  note: string;
};

export type VoiceCall = {
  id: string;
  scenarioId: string;
  runType: RunType | null;
  archetypeId: string | null;
  archetypeDisplayName: string | null;
  guildAgentId: string | null;
  guildAgentVersion: string | null;
  vapiAssistantId: string | null;
  vapiCallId: string | null;
  status: VoiceCallStatus;
  transcript: string;
  summary: string | null;
  outcomeScore: number;
  goalOutcomes: VoiceCallGoalOutcome[];
  branchPoints: VoiceCallBranchPoint[];
  durationSec: number | null;
  endedAt: string | null;
  endedReason: string | null;
  createdAt: string;
};
