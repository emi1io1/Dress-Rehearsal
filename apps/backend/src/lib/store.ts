import { getInsforge } from "./insforge";
import type {
  AgentRun,
  CriticalMoment,
  Curveball,
  FederatedContext,
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
  federated_context: FederatedContext | null;
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
    federatedContext: row.federated_context ?? null,
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

export async function updateScenarioFederatedContext(
  id: string,
  federatedContext: FederatedContext,
): Promise<Scenario | null> {
  const { data, error } = await getInsforge()
    .database.from("scenarios")
    .update({ federated_context: federatedContext })
    .eq("id", id)
    .select();
  if (error)
    throw new Error(`updateScenarioFederatedContext failed: ${error.message}`);
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
  archetype_code_version: string | null;
  guild_agent_id: string | null;
  guild_agent_version: string | null;
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
    archetypeCodeVersion: row.archetype_code_version ?? null,
    guildAgentId: row.guild_agent_id ?? null,
    guildAgentVersion: row.guild_agent_version ?? null,
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
        archetype_code_version: input.archetypeCodeVersion,
        guild_agent_id: input.guildAgentId,
        guild_agent_version: input.guildAgentVersion,
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
  if (patch.archetypeCodeVersion !== undefined)
    dbPatch.archetype_code_version = patch.archetypeCodeVersion;
  if (patch.guildAgentId !== undefined) dbPatch.guild_agent_id = patch.guildAgentId;
  if (patch.guildAgentVersion !== undefined)
    dbPatch.guild_agent_version = patch.guildAgentVersion;
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

// ---------- agent_runs (Phase 6 audit log) ----------

type DbAgentRun = {
  id: string;
  simulation_run_id: string;
  archetype_id: string;
  guild_agent_id: string | null;
  guild_agent_version: string | null;
  archetype_code_version: string;
  archetype_display_name: string;
  scoped_subgraphs: string[];
  input_digest: AgentRun["inputDigest"];
  output_digest: AgentRun["outputDigest"];
  started_at: string;
  finished_at: string | null;
  error: string | null;
};

function fromDbAgentRun(row: DbAgentRun): AgentRun {
  return {
    id: row.id,
    simulationRunId: row.simulation_run_id,
    archetypeId: row.archetype_id,
    guildAgentId: row.guild_agent_id ?? null,
    guildAgentVersion: row.guild_agent_version ?? null,
    archetypeCodeVersion: row.archetype_code_version,
    archetypeDisplayName: row.archetype_display_name,
    scopedSubgraphs: row.scoped_subgraphs ?? [],
    inputDigest: row.input_digest,
    outputDigest: row.output_digest ?? null,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    error: row.error ?? null,
  };
}

export async function createAgentRun(
  input: Omit<AgentRun, "id" | "finishedAt" | "outputDigest" | "error">,
): Promise<AgentRun> {
  const { data, error } = await getInsforge()
    .database.from("agent_runs")
    .insert([
      {
        simulation_run_id: input.simulationRunId,
        archetype_id: input.archetypeId,
        guild_agent_id: input.guildAgentId,
        guild_agent_version: input.guildAgentVersion,
        archetype_code_version: input.archetypeCodeVersion,
        archetype_display_name: input.archetypeDisplayName,
        scoped_subgraphs: input.scopedSubgraphs,
        input_digest: input.inputDigest,
        started_at: input.startedAt,
      },
    ])
    .select();
  if (error) throw new Error(`createAgentRun failed: ${error.message}`);
  if (!data || !data[0]) throw new Error("createAgentRun returned no row");
  return fromDbAgentRun(data[0] as DbAgentRun);
}

export async function finishAgentRun(
  id: string,
  patch: {
    outputDigest?: AgentRun["outputDigest"];
    error?: string | null;
  },
): Promise<AgentRun | null> {
  const dbPatch: Record<string, unknown> = { finished_at: new Date().toISOString() };
  if (patch.outputDigest !== undefined) dbPatch.output_digest = patch.outputDigest;
  if (patch.error !== undefined) dbPatch.error = patch.error;
  const { data, error } = await getInsforge()
    .database.from("agent_runs")
    .update(dbPatch)
    .eq("id", id)
    .select();
  if (error) throw new Error(`finishAgentRun failed: ${error.message}`);
  if (!data || !data[0]) return null;
  return fromDbAgentRun(data[0] as DbAgentRun);
}

export async function listAgentRunsForSim(simulationRunId: string): Promise<AgentRun[]> {
  const { data, error } = await getInsforge()
    .database.from("agent_runs")
    .select()
    .eq("simulation_run_id", simulationRunId)
    .order("started_at", { ascending: true });
  if (error) throw new Error(`listAgentRunsForSim failed: ${error.message}`);
  return ((data ?? []) as DbAgentRun[]).map(fromDbAgentRun);
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

// ---------- voice_calls (Phase 9) ----------

type DbVoiceCall = {
  id: string;
  scenario_id: string;
  run_type: string | null;
  archetype_id: string | null;
  archetype_display_name: string | null;
  guild_agent_id: string | null;
  guild_agent_version: string | null;
  vapi_assistant_id: string | null;
  vapi_call_id: string | null;
  status: string;
  transcript: string;
  summary: string | null;
  outcome_score: number;
  goal_outcomes: VoiceCall["goalOutcomes"] | null;
  branch_points: VoiceCall["branchPoints"] | null;
  duration_sec: number | null;
  ended_at: string | null;
  ended_reason: string | null;
  created_at: string;
};

function fromDbVoiceCall(row: DbVoiceCall): VoiceCall {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    runType: (row.run_type as VoiceCall["runType"]) ?? null,
    archetypeId: row.archetype_id ?? null,
    archetypeDisplayName: row.archetype_display_name ?? null,
    guildAgentId: row.guild_agent_id ?? null,
    guildAgentVersion: row.guild_agent_version ?? null,
    vapiAssistantId: row.vapi_assistant_id ?? null,
    vapiCallId: row.vapi_call_id ?? null,
    status: row.status as VoiceCall["status"],
    transcript: row.transcript ?? "",
    summary: row.summary ?? null,
    outcomeScore: row.outcome_score,
    goalOutcomes: row.goal_outcomes ?? [],
    branchPoints: row.branch_points ?? [],
    durationSec: row.duration_sec ?? null,
    endedAt: row.ended_at ?? null,
    endedReason: row.ended_reason ?? null,
    createdAt: row.created_at,
  };
}

export async function createVoiceCall(input: {
  scenarioId: string;
  runType: VoiceCall["runType"];
  archetypeId: string | null;
  archetypeDisplayName: string | null;
  guildAgentId: string | null;
  guildAgentVersion: string | null;
  vapiAssistantId: string | null;
}): Promise<VoiceCall> {
  const { data, error } = await getInsforge()
    .database.from("voice_calls")
    .insert([
      {
        scenario_id: input.scenarioId,
        run_type: input.runType,
        archetype_id: input.archetypeId,
        archetype_display_name: input.archetypeDisplayName,
        guild_agent_id: input.guildAgentId,
        guild_agent_version: input.guildAgentVersion,
        vapi_assistant_id: input.vapiAssistantId,
        vapi_call_id: null,
        transcript: "",
        outcome_score: 0,
        status: "prepared",
      },
    ])
    .select();
  if (error) throw new Error(`createVoiceCall failed: ${error.message}`);
  const row = data?.[0] as DbVoiceCall | undefined;
  if (!row) throw new Error("createVoiceCall returned no row");
  return fromDbVoiceCall(row);
}

export async function updateVoiceCall(
  id: string,
  patch: Partial<VoiceCall>,
): Promise<VoiceCall | null> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.vapiAssistantId !== undefined) dbPatch.vapi_assistant_id = patch.vapiAssistantId;
  if (patch.vapiCallId !== undefined) dbPatch.vapi_call_id = patch.vapiCallId;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.transcript !== undefined) dbPatch.transcript = patch.transcript;
  if (patch.summary !== undefined) dbPatch.summary = patch.summary;
  if (patch.outcomeScore !== undefined) dbPatch.outcome_score = patch.outcomeScore;
  if (patch.goalOutcomes !== undefined) dbPatch.goal_outcomes = patch.goalOutcomes;
  if (patch.branchPoints !== undefined) dbPatch.branch_points = patch.branchPoints;
  if (patch.durationSec !== undefined) dbPatch.duration_sec = patch.durationSec;
  if (patch.endedAt !== undefined) dbPatch.ended_at = patch.endedAt;
  if (patch.endedReason !== undefined) dbPatch.ended_reason = patch.endedReason;

  const { data, error } = await getInsforge()
    .database.from("voice_calls")
    .update(dbPatch)
    .eq("id", id)
    .select();
  if (error) throw new Error(`updateVoiceCall failed: ${error.message}`);
  if (!data || !data[0]) return null;
  return fromDbVoiceCall(data[0] as DbVoiceCall);
}

export async function getVoiceCall(id: string): Promise<VoiceCall | null> {
  const { data, error } = await getInsforge()
    .database.from("voice_calls")
    .select()
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getVoiceCall failed: ${error.message}`);
  if (!data) return null;
  return fromDbVoiceCall(data as DbVoiceCall);
}

export async function getVoiceCallByVapiId(vapiCallId: string): Promise<VoiceCall | null> {
  const { data, error } = await getInsforge()
    .database.from("voice_calls")
    .select()
    .eq("vapi_call_id", vapiCallId)
    .maybeSingle();
  if (error) throw new Error(`getVoiceCallByVapiId failed: ${error.message}`);
  if (!data) return null;
  return fromDbVoiceCall(data as DbVoiceCall);
}

export async function listVoiceCalls(scenarioId: string): Promise<VoiceCall[]> {
  const { data, error } = await getInsforge()
    .database.from("voice_calls")
    .select()
    .eq("scenario_id", scenarioId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listVoiceCalls failed: ${error.message}`);
  return ((data ?? []) as DbVoiceCall[]).map(fromDbVoiceCall);
}
