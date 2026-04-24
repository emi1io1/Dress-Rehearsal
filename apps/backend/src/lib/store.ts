import { getInsforge } from "./insforge";
import type {
  CriticalMoment,
  Curveball,
  GapAnalysis,
  Grounding,
  Iteration,
  Outcome,
  Scenario,
  ScenarioContext,
  SimulationRun,
  VoiceCall,
} from "@rehearsal/types";

/**
 * Store backed by Insforge Postgres via @insforge/sdk.
 * DB is snake_case; app types are camelCase. Mappers handle the seam.
 */

// ---------- scenarios ----------

type DbScenario = {
  id: string;
  user_id: string;
  scenario_type: string;
  context: ScenarioContext;
  counterparty_info: string;
  user_goals: string[];
  grounding: Grounding | null;
  created_at: string;
};

function fromDbScenario(row: DbScenario): Scenario {
  return {
    id: row.id,
    userId: row.user_id,
    scenarioType: row.scenario_type as Scenario["scenarioType"],
    context: row.context,
    counterpartyInfo: row.counterparty_info,
    userGoals: row.user_goals,
    grounding: row.grounding ?? null,
    createdAt: row.created_at,
  };
}

export async function updateScenarioGrounding(
  id: string,
  grounding: Grounding,
): Promise<Scenario | null> {
  const { data, error } = await getInsforge()
    .database.from("scenarios")
    .update({ grounding })
    .eq("id", id)
    .select();
  if (error) throw new Error(`updateScenarioGrounding failed: ${error.message}`);
  if (!data || !data[0]) return null;
  return fromDbScenario(data[0] as DbScenario);
}

export async function createScenario(input: {
  userId: string;
  context: ScenarioContext;
  userGoals: string[];
  counterpartyInfo?: string;
}): Promise<Scenario> {
  const { data, error } = await getInsforge()
    .database.from("scenarios")
    .insert([
      {
        user_id: input.userId,
        scenario_type: "job_interview",
        context: input.context,
        counterparty_info: input.counterpartyInfo ?? "",
        user_goals: input.userGoals,
      },
    ])
    .select();
  if (error) throw new Error(`createScenario failed: ${error.message}`);
  if (!data || !data[0]) throw new Error("createScenario returned no row");
  return fromDbScenario(data[0] as DbScenario);
}

export async function getScenario(id: string): Promise<Scenario | null> {
  const { data, error } = await getInsforge()
    .database.from("scenarios")
    .select()
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getScenario failed: ${error.message}`);
  if (!data) return null;
  return fromDbScenario(data as DbScenario);
}

export async function listScenarios(userId: string): Promise<Scenario[]> {
  const { data, error } = await getInsforge()
    .database.from("scenarios")
    .select()
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listScenarios failed: ${error.message}`);
  return ((data ?? []) as DbScenario[]).map(fromDbScenario);
}

// ---------- simulation_runs ----------

type DbSimulationRun = {
  id: string;
  scenario_id: string;
  run_type: string;
  persona_archetype: string;
  archetype_name: string;
  curveballs: Curveball[];
  gap_analysis: GapAnalysis;
  critical_moment: CriticalMoment | null;
  outcome: Outcome | null;
  status: string;
  error: string | null;
  created_at: string;
};

function fromDbRun(row: DbSimulationRun): SimulationRun {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    runType: row.run_type as SimulationRun["runType"],
    personaArchetype: row.persona_archetype,
    archetypeName: row.archetype_name,
    curveballs: row.curveballs ?? [],
    gapAnalysis: row.gap_analysis ?? { unaddressed: [], weak: [], strong: [] },
    criticalMoment: row.critical_moment ?? null,
    outcome: row.outcome ?? null,
    status: row.status as SimulationRun["status"],
    error: row.error ?? undefined,
    createdAt: row.created_at,
  };
}

export async function createSimulationRun(
  input: Omit<SimulationRun, "id" | "createdAt">,
): Promise<SimulationRun> {
  const { data, error } = await getInsforge()
    .database.from("simulation_runs")
    .insert([
      {
        scenario_id: input.scenarioId,
        run_type: input.runType,
        persona_archetype: input.personaArchetype,
        archetype_name: input.archetypeName,
        curveballs: input.curveballs,
        gap_analysis: input.gapAnalysis,
        critical_moment: input.criticalMoment,
        outcome: input.outcome,
        status: input.status,
        error: input.error ?? null,
      },
    ])
    .select();
  if (error) throw new Error(`createSimulationRun failed: ${error.message}`);
  if (!data || !data[0]) throw new Error("createSimulationRun returned no row");
  return fromDbRun(data[0] as DbSimulationRun);
}

export async function updateSimulationRun(
  id: string,
  patch: Partial<SimulationRun>,
): Promise<SimulationRun | null> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.archetypeName !== undefined) dbPatch.archetype_name = patch.archetypeName;
  if (patch.curveballs !== undefined) dbPatch.curveballs = patch.curveballs;
  if (patch.gapAnalysis !== undefined) dbPatch.gap_analysis = patch.gapAnalysis;
  if (patch.criticalMoment !== undefined) dbPatch.critical_moment = patch.criticalMoment;
  if (patch.outcome !== undefined) dbPatch.outcome = patch.outcome;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.error !== undefined) dbPatch.error = patch.error;

  const { data, error } = await getInsforge()
    .database.from("simulation_runs")
    .update(dbPatch)
    .eq("id", id)
    .select();
  if (error) throw new Error(`updateSimulationRun failed: ${error.message}`);
  if (!data || !data[0]) return null;
  return fromDbRun(data[0] as DbSimulationRun);
}

export async function listSimulationRuns(scenarioId: string): Promise<SimulationRun[]> {
  const { data, error } = await getInsforge()
    .database.from("simulation_runs")
    .select()
    .eq("scenario_id", scenarioId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listSimulationRuns failed: ${error.message}`);
  return ((data ?? []) as DbSimulationRun[]).map(fromDbRun);
}

export async function getSimulationRun(id: string): Promise<SimulationRun | null> {
  const { data, error } = await getInsforge()
    .database.from("simulation_runs")
    .select()
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getSimulationRun failed: ${error.message}`);
  if (!data) return null;
  return fromDbRun(data as DbSimulationRun);
}

// ---------- iterations (wired up; UI lands in Phase 8) ----------

type DbIteration = {
  id: string;
  scenario_id: string;
  iteration_number: number;
  user_additions: string;
  confidence_score: number;
  created_at: string;
};

export async function createIteration(input: {
  scenarioId: string;
  iterationNumber: number;
  userAdditions: string;
  confidenceScore: number;
}): Promise<Iteration> {
  const { data, error } = await getInsforge()
    .database.from("iterations")
    .insert([
      {
        scenario_id: input.scenarioId,
        iteration_number: input.iterationNumber,
        user_additions: input.userAdditions,
        confidence_score: input.confidenceScore,
      },
    ])
    .select();
  if (error) throw new Error(`createIteration failed: ${error.message}`);
  const row = data?.[0] as DbIteration | undefined;
  if (!row) throw new Error("createIteration returned no row");
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    iterationNumber: row.iteration_number,
    userAdditions: row.user_additions,
    confidenceScore: row.confidence_score,
    createdAt: row.created_at,
  };
}

// ---------- voice_calls (wired up; UI lands in Phase 9) ----------

type DbVoiceCall = {
  id: string;
  scenario_id: string;
  vapi_call_id: string;
  transcript: string;
  outcome_score: number;
  created_at: string;
};

export async function createVoiceCall(input: {
  scenarioId: string;
  vapiCallId: string;
  transcript: string;
  outcomeScore: number;
}): Promise<VoiceCall> {
  const { data, error } = await getInsforge()
    .database.from("voice_calls")
    .insert([
      {
        scenario_id: input.scenarioId,
        vapi_call_id: input.vapiCallId,
        transcript: input.transcript,
        outcome_score: input.outcomeScore,
      },
    ])
    .select();
  if (error) throw new Error(`createVoiceCall failed: ${error.message}`);
  const row = data?.[0] as DbVoiceCall | undefined;
  if (!row) throw new Error("createVoiceCall returned no row");
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    vapiCallId: row.vapi_call_id,
    transcript: row.transcript,
    outcomeScore: row.outcome_score,
    createdAt: row.created_at,
  };
}
