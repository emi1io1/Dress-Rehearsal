"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPath } from "@/lib/api";
import type {
  CriticalMoment,
  Curveball,
  CurveballRisk,
  GapAnalysis,
  Grounding,
  Outcome,
  RunType,
  Scenario,
  SimulationRun,
} from "@rehearsal/types";

type ApiResp = { scenario: Scenario; runs: SimulationRun[] };

type CardState = {
  runId: string;
  runType: RunType;
  archetypeId: string;
  archetypeName: string;
  status: "pending" | "started" | "stage1" | "stage2" | "done" | "error";
  curveballs: Curveball[];
  gapAnalysis: GapAnalysis;
  outcome: Outcome | null;
  criticalMoment: CriticalMoment | null;
  error?: string;
};

type StreamEvent =
  | { type: "hello"; runIds: string[]; totalSims: number }
  | { type: "started"; runId: string; runType: RunType; archetypeId: string; archetypeName: string; at: number }
  | { type: "analysis_complete"; runId: string; curveballs: Curveball[]; gapAnalysis: GapAnalysis; outcome: Outcome; at: number }
  | { type: "critical_moment_complete"; runId: string; criticalMoment: CriticalMoment | null; at: number }
  | { type: "done"; runId: string; at: number }
  | { type: "error"; runId: string; message: string; at: number }
  | { type: "stream_error"; runId: string; message: string }
  | { type: "batch_done"; completed: string[]; remaining: string[] };

const RUN_LABEL: Record<RunType, string> = {
  best: "Best case",
  likely: "Likely case",
  worst: "Worst case",
};

const RUN_TONE: Record<RunType, string> = {
  best: "border-emerald-900/60 bg-emerald-950/20 text-emerald-300",
  likely: "border-amber-900/60 bg-amber-950/20 text-amber-300",
  worst: "border-rose-900/60 bg-rose-950/20 text-rose-300",
};

const RISK_TONE: Record<CurveballRisk, string> = {
  HIGH: "border-rose-800 bg-rose-950/30 text-rose-300",
  MEDIUM: "border-amber-800 bg-amber-950/30 text-amber-300",
  LOW: "border-neutral-700 bg-neutral-900 text-neutral-400",
};

const CATEGORY_LABEL: Record<string, string> = {
  resume_gap: "Resume gap",
  role_requirement: "Role requirement",
  company_specific: "Company-specific",
  values_probe: "Values probe",
  technical_depth: "Technical depth",
};

const FIT_TONE: Record<"strong" | "mixed" | "weak", string> = {
  strong: "text-emerald-400",
  mixed: "text-amber-300",
  weak: "text-rose-300",
};

const GOAL_RESULT_TONE: Record<"achieved" | "partial" | "missed", string> = {
  achieved: "text-emerald-400",
  partial: "text-amber-300",
  missed: "text-rose-300",
};

export default function RehearsalPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [cardOrder, setCardOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [grounding, setGrounding] = useState(false);
  const [batchDone, setBatchDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSimId, setExpandedSimId] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);

  // Initial load: fetch scenario + any previously persisted runs
  const loadInitial = useCallback(async () => {
    const res = await fetch(apiPath(`/api/scenarios/${id}`), { cache: "no-store" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? `Load failed: ${res.status}`);
      return;
    }
    const data: ApiResp = await res.json();
    setScenario(data.scenario);
    if (data.runs.length > 0) {
      const initial: Record<string, CardState> = {};
      const order: string[] = [];
      for (const r of data.runs) {
        initial[r.id] = {
          runId: r.id,
          runType: r.runType,
          archetypeId: r.personaArchetype,
          archetypeName: r.archetypeName || r.personaArchetype,
          status: r.status === "complete" ? "done" : r.status === "error" ? "error" : "stage1",
          curveballs: r.curveballs,
          gapAnalysis: r.gapAnalysis,
          outcome: r.outcome,
          criticalMoment: r.criticalMoment,
          error: r.error,
        };
        order.push(r.id);
      }
      setCards(initial);
      setCardOrder(order);
    }
  }, [id]);

  useEffect(() => {
    loadInitial().finally(() => setLoading(false));
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [loadInitial]);

  async function runAll() {
    setRunning(true);
    setBatchDone(false);
    setError(null);
    setCards({});
    setCardOrder([]);
    setExpandedSimId(null);

    // If no grounding yet, the server will do TinyFish research first — surface
    // that as its own phase in the UI.
    const needsGrounding = !scenario?.grounding;
    if (needsGrounding) setGrounding(true);

    try {
      const res = await fetch(apiPath(`/api/scenarios/${id}/run-all`), { method: "POST" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `run-all failed: ${res.status}`);
      }
      const { runIds }: { runIds: string[] } = await res.json();
      setGrounding(false);

      // If grounding was just produced server-side, refresh scenario so the
      // GroundingCard appears.
      if (needsGrounding) {
        void fetch(apiPath(`/api/scenarios/${id}`), { cache: "no-store" })
          .then((r) => r.json())
          .then((d: ApiResp) => setScenario(d.scenario))
          .catch(() => {});
      }

      // Seed pending cards in the planned order.
      const seeded: Record<string, CardState> = {};
      for (const rid of runIds) {
        seeded[rid] = {
          runId: rid,
          runType: "likely",
          archetypeId: "",
          archetypeName: "Connecting…",
          status: "pending",
          curveballs: [],
          gapAnalysis: { unaddressed: [], weak: [], strong: [] },
          outcome: null,
          criticalMoment: null,
        };
      }
      setCards(seeded);
      setCardOrder(runIds);

      // Subscribe to SSE.
      esRef.current?.close();
      const es = new EventSource(apiPath(`/api/scenarios/${id}/stream`));
      esRef.current = es;

      es.onmessage = (msg) => {
        const ev = JSON.parse(msg.data) as StreamEvent;
        setCards((prev) => applyEvent(prev, ev));
        if (ev.type === "batch_done") {
          setBatchDone(true);
          setRunning(false);
          es.close();
          esRef.current = null;
        }
      };

      es.onerror = () => {
        setError("Live stream disconnected.");
        setRunning(false);
        es.close();
        esRef.current = null;
      };
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
      setGrounding(false);
    }
  }

  const completedRuns = useMemo(
    () =>
      cardOrder
        .map((id) => cards[id])
        .filter((c): c is CardState => !!c && (c.status === "stage2" || c.status === "done")),
    [cards, cardOrder],
  );

  const progress = useMemo(() => {
    const total = cardOrder.length || 10;
    const done = cardOrder
      .map((id) => cards[id])
      .filter((c) => c && (c.status === "done" || c.status === "error")).length;
    const stage1 = cardOrder
      .map((id) => cards[id])
      .filter((c) => c && (c.status === "stage1" || c.status === "stage2")).length;
    return { total, done, stage1 };
  }, [cards, cardOrder]);

  if (loading) {
    return (
      <main className="flex-1 px-6 py-12">
        <div className="max-w-7xl mx-auto text-neutral-500">Loading rehearsal…</div>
      </main>
    );
  }
  if (!scenario) {
    return (
      <main className="flex-1 px-6 py-12">
        <div className="max-w-7xl mx-auto">
          <p className="text-red-400">{error ?? "Scenario not found."}</p>
          <Link href="/" className="mt-4 inline-block text-sm text-neutral-400 hover:text-neutral-200">
            ← Home
          </Link>
        </div>
      </main>
    );
  }

  const expandedSim = expandedSimId ? cards[expandedSimId] : null;

  return (
    <main className="flex-1 px-6 py-12">
      <div className="max-w-7xl mx-auto">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Home
        </Link>

        <header className="mt-6 flex items-start justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-neutral-500">Rehearsal</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {scenario.context.jobTitle}{" "}
              <span className="text-neutral-500">· {scenario.context.company}</span>
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              {scenario.userGoals.length} goals · created{" "}
              {new Date(scenario.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={runAll}
              disabled={running}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {grounding
                ? `Researching ${scenario.context.company}…`
                : running
                  ? `Running ${progress.done}/${progress.total}…`
                  : batchDone || completedRuns.length > 0
                    ? "Run another batch"
                    : "Run full rehearsal (10 sims)"}
            </button>
            <p className="text-xs text-neutral-500">
              {grounding ? "TinyFish · live web grounding" : "10 parallel · live streaming via Redis"}
            </p>
          </div>
        </header>

        {error ? (
          <div className="mt-6 rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <section className="mt-10">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-widest">Goals</h2>
          <ul className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            {scenario.userGoals.map((g, i) => (
              <li
                key={i}
                className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-300"
              >
                {g}
              </li>
            ))}
          </ul>
        </section>

        {scenario.grounding ? (
          <GroundingCard grounding={scenario.grounding} company={scenario.context.company} />
        ) : null}

        {completedRuns.length > 0 ? <AggregateDashboard runs={completedRuns} /> : null}

        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-widest">
              Parallel simulations
            </h2>
            {cardOrder.length > 0 ? (
              <span className="text-xs text-neutral-500">
                {progress.done}/{progress.total} complete
              </span>
            ) : null}
          </div>

          {cardOrder.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
              <p>No batch yet. Click “Run full rehearsal” to kick off 10 parallel sims.</p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {cardOrder.map((rid) => {
                const card = cards[rid];
                if (!card) return null;
                return (
                  <SimCard
                    key={rid}
                    card={card}
                    onClick={() => setExpandedSimId(rid)}
                  />
                );
              })}
            </div>
          )}
        </section>

        {expandedSim ? (
          <SimDetailModal card={expandedSim} onClose={() => setExpandedSimId(null)} />
        ) : null}
      </div>
    </main>
  );
}

// ---------- event reducer ----------

function applyEvent(
  prev: Record<string, CardState>,
  ev: StreamEvent,
): Record<string, CardState> {
  if (ev.type === "hello" || ev.type === "batch_done" || ev.type === "stream_error") return prev;

  const current = prev[ev.runId];
  const base: CardState =
    current ?? {
      runId: ev.runId,
      runType: "likely",
      archetypeId: "",
      archetypeName: "",
      status: "pending",
      curveballs: [],
      gapAnalysis: { unaddressed: [], weak: [], strong: [] },
      outcome: null,
      criticalMoment: null,
    };

  switch (ev.type) {
    case "started":
      return {
        ...prev,
        [ev.runId]: {
          ...base,
          runType: ev.runType,
          archetypeId: ev.archetypeId,
          archetypeName: ev.archetypeName,
          status: "started",
        },
      };
    case "analysis_complete":
      return {
        ...prev,
        [ev.runId]: {
          ...base,
          curveballs: ev.curveballs,
          gapAnalysis: ev.gapAnalysis,
          outcome: ev.outcome,
          status: "stage1",
        },
      };
    case "critical_moment_complete":
      return {
        ...prev,
        [ev.runId]: {
          ...base,
          criticalMoment: ev.criticalMoment,
          status: "stage2",
        },
      };
    case "done":
      return { ...prev, [ev.runId]: { ...base, status: "done" } };
    case "error":
      return { ...prev, [ev.runId]: { ...base, status: "error", error: ev.message } };
  }
}

// ---------- sim card (compact, in the 10-wide grid) ----------

function SimCard({ card, onClick }: { card: CardState; onClick: () => void }) {
  const stageLabel =
    card.status === "pending"
      ? "Pending"
      : card.status === "started"
        ? "Analyzing…"
        : card.status === "stage1"
          ? "Critical moment…"
          : card.status === "stage2" || card.status === "done"
            ? "Complete"
            : "Error";

  const high = card.curveballs.filter((c) => c.risk === "HIGH").length;

  return (
    <button
      onClick={onClick}
      className="group text-left rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden transition hover:border-neutral-700 hover:bg-neutral-900/60"
    >
      <div className={`px-3 py-2 text-[10px] font-medium uppercase tracking-wider border-b border-neutral-800 flex items-center justify-between ${RUN_TONE[card.runType]}`}>
        <span>{RUN_LABEL[card.runType]}</span>
        {card.status === "started" || card.status === "stage1" ? (
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
        ) : null}
      </div>
      <div className="p-3 space-y-2">
        <div>
          <div className="text-sm text-neutral-100 leading-tight">{card.archetypeName || "—"}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">{stageLabel}</div>
        </div>

        {card.outcome ? (
          <div className="text-[11px] space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">fit</span>
              <span className={`font-medium uppercase ${FIT_TONE[card.outcome.roleFit]}`}>
                {card.outcome.roleFit}
              </span>
            </div>
            {card.curveballs.length > 0 ? (
              <div className="text-neutral-400">
                {card.curveballs.length} curveballs · <span className="text-rose-300">{high} HIGH</span>
              </div>
            ) : null}
          </div>
        ) : card.status === "pending" ? (
          <div className="text-[11px] text-neutral-600">waiting…</div>
        ) : (
          <div className="text-[11px] text-neutral-500 flex items-center gap-1.5">
            <span className="inline-block h-1 w-1 rounded-full bg-amber-400 animate-pulse" />
            thinking
          </div>
        )}

        {card.criticalMoment ? (
          card.criticalMoment.handled ? (
            <div className="text-[10px] text-emerald-400">✓ covered</div>
          ) : (
            <div className="text-[10px] text-rose-400">⚠ gap surfaced</div>
          )
        ) : null}

        {card.error ? (
          <div className="text-[10px] text-red-400 truncate">err: {card.error}</div>
        ) : null}
      </div>
    </button>
  );
}

// ---------- expanded sim detail (modal-style drawer) ----------

function SimDetailModal({ card, onClose }: { card: CardState; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="max-w-3xl mx-auto mt-10 rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${RUN_TONE[card.runType]}`}>
              {RUN_LABEL[card.runType]}
            </span>
            <span className="text-sm text-neutral-200">{card.archetypeName}</span>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-200"
          >
            close
          </button>
        </div>

        <div className="p-5 space-y-5">
          {card.outcome ? (
            <div>
              <p className="text-sm text-neutral-200">{card.outcome.summary}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="text-neutral-500">Role fit:</span>
                <span className={`font-medium uppercase ${FIT_TONE[card.outcome.roleFit]}`}>
                  {card.outcome.roleFit}
                </span>
                {card.outcome.salaryOutcome ? (
                  <>
                    <span className="text-neutral-500">Salary:</span>
                    <span className="text-neutral-300">{card.outcome.salaryOutcome}</span>
                  </>
                ) : null}
              </div>
              {card.outcome.goalAchievement.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs">
                  {card.outcome.goalAchievement.map((g, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={`uppercase font-medium ${GOAL_RESULT_TONE[g.result]}`}>
                        {g.result}
                      </span>
                      <span className="text-neutral-400">{g.goal}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Analysis still running…</p>
          )}

          <CurveballsList curveballs={card.curveballs} />
          <CriticalMomentView card={card} />
        </div>
      </div>
    </div>
  );
}

function CurveballsList({ curveballs }: { curveballs: Curveball[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (curveballs.length === 0) return null;

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div>
      <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
        Curveballs ({curveballs.length})
      </div>
      <ul className="space-y-1.5">
        {curveballs.map((c) => {
          const isOpen = expanded.has(c.id);
          return (
            <li key={c.id}>
              <button
                onClick={() => toggle(c.id)}
                className="w-full text-left rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 transition hover:bg-neutral-900/60"
              >
                <div className="flex items-start gap-3">
                  <span className={`shrink-0 inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${RISK_TONE[c.risk]}`}>
                    {c.risk}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-neutral-100">{c.question}</p>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      {CATEGORY_LABEL[c.category] ?? c.category}
                    </p>
                  </div>
                  <span
                    aria-hidden
                    className={`text-neutral-500 transition ${isOpen ? "rotate-90" : ""}`}
                  >
                    ›
                  </span>
                </div>
                {isOpen ? (
                  <p className="mt-2 pl-[calc(2.5rem+0.75rem)] text-xs text-neutral-400 leading-relaxed">
                    <span className="text-neutral-500">Why: </span>
                    {c.reason || "No reason provided."}
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CriticalMomentView({ card }: { card: CardState }) {
  const cm = card.criticalMoment;
  if (!cm) {
    return (
      <div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-3 text-xs text-neutral-500">
        Critical moment still generating…
      </div>
    );
  }
  const pressed = card.curveballs.find((c) => c.id === cm.curveballId);

  return (
    <div>
      <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
        Critical moment
      </div>
      <div className="rounded-md border border-neutral-800 bg-neutral-900/40 p-3 space-y-3 text-sm">
        {pressed ? (
          <p className="text-xs text-neutral-500 italic">
            Pressing: &ldquo;{pressed.question}&rdquo;
          </p>
        ) : null}
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-sky-400">
            {card.archetypeName || "Interviewer"}
          </div>
          <p className="mt-1 text-neutral-200 leading-relaxed">{cm.interviewerLine}</p>
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
            You (based on your stated context)
          </div>
          <p className="mt-1 text-neutral-200 leading-relaxed">{cm.userProxyLine}</p>
        </div>
        {!cm.handled ? (
          <div className="rounded-md border border-rose-900/60 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
            <span className="font-semibold">Gap: </span>
            {cm.failureMode ?? "Your context does not cover this."}
          </div>
        ) : (
          <div className="rounded-md border border-emerald-900/60 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-300">
            Context covers this.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- aggregate dashboard ----------

function AggregateDashboard({ runs }: { runs: CardState[] }) {
  const aggregate = useMemo(() => buildAggregate(runs), [runs]);

  return (
    <section className="mt-12">
      <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-widest">
        Aggregate dashboard
      </h2>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title="Top high-risk curveballs" hint="Deduped across 10 sims">
          {aggregate.topCurveballs.length === 0 ? (
            <Empty>No high-risk questions identified yet.</Empty>
          ) : (
            <ol className="space-y-2">
              {aggregate.topCurveballs.map((c, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-xs text-neutral-400">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <span className={`mr-2 inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${RISK_TONE[c.risk]}`}>
                      {c.risk}
                    </span>
                    <span className="text-neutral-200">{c.question}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </DashCard>

        <DashCard title="Prep checklist" hint="Ranked by highest leverage">
          {aggregate.prepChecklist.length === 0 ? (
            <Empty>Prep checklist will appear as sims complete.</Empty>
          ) : (
            <ol className="space-y-2">
              {aggregate.prepChecklist.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-xs text-neutral-400">
                    {i + 1}
                  </span>
                  <span className="text-neutral-200">{item}</span>
                </li>
              ))}
            </ol>
          )}
        </DashCard>

        <DashCard title="Consistent weak points" hint="🟡 thin context">
          {aggregate.weakPoints.length === 0 ? (
            <Empty>No consistent weak points yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {aggregate.weakPoints.map((w, i) => (
                <li key={i} className="text-sm text-neutral-300">
                  <span className="text-amber-400 mr-2">🟡</span>
                  {w}
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        <DashCard title="Consistent strengths" hint="🟢 defensible">
          {aggregate.strengths.length === 0 ? (
            <Empty>No consistent strengths yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {aggregate.strengths.map((s, i) => (
                <li key={i} className="text-sm text-neutral-300">
                  <span className="text-emerald-400 mr-2">🟢</span>
                  {s}
                </li>
              ))}
            </ul>
          )}
        </DashCard>
      </div>
    </section>
  );
}

type Aggregate = {
  topCurveballs: Curveball[];
  prepChecklist: string[];
  weakPoints: string[];
  strengths: string[];
};

function buildAggregate(runs: CardState[]): Aggregate {
  const riskRank: Record<CurveballRisk, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const seen = new Map<string, Curveball>();
  for (const r of runs) {
    for (const c of r.curveballs) {
      const key = c.question.trim().toLowerCase().slice(0, 80);
      const prev = seen.get(key);
      if (!prev || riskRank[c.risk] < riskRank[prev.risk]) seen.set(key, c);
    }
  }
  const topCurveballs = [...seen.values()]
    .sort((a, b) => riskRank[a.risk] - riskRank[b.risk])
    .slice(0, 5);

  const unaddressedFreq = countFrequencies(runs.flatMap((r) => r.gapAnalysis.unaddressed));
  const weakFreq = countFrequencies(runs.flatMap((r) => r.gapAnalysis.weak));
  const strongFreq = countFrequencies(runs.flatMap((r) => r.gapAnalysis.strong));

  const weakPoints = topN(weakFreq, 3);
  const strengths = topN(strongFreq, 3);

  const prep: string[] = [];
  for (const u of topN(unaddressedFreq, 3)) prep.push(`Prepare for: ${u}`);
  for (const c of topCurveballs.filter((c) => c.risk === "HIGH")) {
    prep.push(`Rehearse answer to: "${c.question}"`);
  }
  for (const w of weakPoints) prep.push(`Strengthen: ${w}`);
  const prepChecklist = dedupe(prep).slice(0, 6);

  return { topCurveballs, prepChecklist, weakPoints, strengths };
}

function countFrequencies(xs: string[]): Map<string, { count: number; text: string }> {
  const m = new Map<string, { count: number; text: string }>();
  for (const x of xs) {
    const key = x.trim().toLowerCase().slice(0, 80);
    if (!key) continue;
    const prev = m.get(key);
    if (prev) prev.count += 1;
    else m.set(key, { count: 1, text: x.trim() });
  }
  return m;
}

function topN(freq: Map<string, { count: number; text: string }>, n: number): string[] {
  return [...freq.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((v) => v.text);
}

function dedupe(xs: string[]): string[] {
  const s = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.toLowerCase().slice(0, 80);
    if (s.has(k)) continue;
    s.add(k);
    out.push(x);
  }
  return out;
}

// ---------- GroundingCard (collapsible, shows TinyFish research) ----------

function GroundingCard({ grounding, company }: { grounding: Grounding; company: string }) {
  const [open, setOpen] = useState(false);

  const sections: Array<{ title: string; items: string[]; accent: string }> = [
    { title: "Recent moves", items: grounding.newsItems, accent: "text-sky-300" },
    { title: "Culture / interview style", items: grounding.cultureSignals, accent: "text-violet-300" },
    { title: "Recent events", items: grounding.recentEvents, accent: "text-amber-300" },
    { title: "Interview focus", items: grounding.interviewFocus, accent: "text-emerald-300" },
  ].filter((s) => s.items.length > 0);

  const totalBullets = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <section className="mt-10 rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 transition hover:bg-neutral-900/60"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-800 bg-sky-950/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            Grounded via TinyFish
          </span>
          <span className="text-sm text-neutral-200">
            Live research on {company}
          </span>
          <span className="text-[11px] text-neutral-500">
            · {totalBullets} findings · {grounding.sources.length} sources
          </span>
        </div>
        <span aria-hidden className={`text-neutral-500 transition ${open ? "rotate-90" : ""}`}>
          ›
        </span>
      </button>

      {open ? (
        <div className="border-t border-neutral-800 px-4 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.map((section) => (
              <div key={section.title}>
                <div className={`text-[11px] font-medium uppercase tracking-wider mb-2 ${section.accent}`}>
                  {section.title}
                </div>
                <ul className="space-y-1.5">
                  {section.items.map((item, i) => (
                    <li key={i} className="text-sm text-neutral-300 leading-relaxed">
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {grounding.sources.length > 0 ? (
            <div className="pt-3 border-t border-neutral-800">
              <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">
                Sources
              </div>
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {grounding.sources.map((s, i) => (
                  <li key={i} className="text-[11px]">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-neutral-400 hover:text-neutral-200 underline decoration-neutral-700 decoration-dotted underline-offset-2"
                    >
                      {s.siteName ?? new URL(s.url).hostname}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DashCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
      <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-300 uppercase tracking-wider">{title}</span>
        {hint ? <span className="text-[10px] text-neutral-500">{hint}</span> : null}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-500">{children}</p>;
}
