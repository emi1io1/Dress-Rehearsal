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

export type Scenario = {
  id: string;
  userId: string;
  scenarioType: ScenarioType;
  context: ScenarioContext;
  counterpartyInfo: string;
  userGoals: string[];
  grounding: Grounding | null;
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
  curveballs: Curveball[];
  gapAnalysis: GapAnalysis;
  criticalMoment: CriticalMoment | null;
  outcome: Outcome | null;
  status: "pending" | "running" | "complete" | "error";
  error?: string;
  createdAt: string;
};

export type Iteration = {
  id: string;
  scenarioId: string;
  iterationNumber: number;
  userAdditions: string;
  confidenceScore: number;
  createdAt: string;
};

export type VoiceCall = {
  id: string;
  scenarioId: string;
  vapiCallId: string;
  transcript: string;
  outcomeScore: number;
  createdAt: string;
};
