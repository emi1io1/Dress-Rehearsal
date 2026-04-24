import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="max-w-3xl w-full">
        <div className="mb-8 flex items-center gap-2 text-xs uppercase tracking-widest text-neutral-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Rehearsal · Phase 1
        </div>

        <h1 className="text-5xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
          Pilots don&apos;t practice on real planes.
          <br />
          <span className="text-neutral-400">Stop practicing high-stakes conversations on reality.</span>
        </h1>

        <p className="mt-8 text-lg text-neutral-400 leading-relaxed max-w-2xl">
          Rehearsal spins up 10 parallel AI simulations of your upcoming interview,
          negotiation, or tough conversation — across best-case, likely-case, and
          worst-case scenarios. You see where you get cornered before it matters.
        </p>

        <div className="mt-10 flex items-center gap-4">
          <Link
            href="/new"
            className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200"
          >
            Start a rehearsal
            <span aria-hidden>→</span>
          </Link>
          <span className="text-sm text-neutral-500">Job interviews supported today.</span>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-neutral-400">
          <Step n="1" title="Load context">
            Drop in the job description, your background, salary target, and concerns.
          </Step>
          <Step n="2" title="Run parallel sims">
            10 AI interviewers in parallel — warm, neutral, and hostile.
          </Step>
          <Step n="3" title="Iterate to confidence">
            See branch points where you missed goals. Add prep. Re-run. Ship ready.
          </Step>
        </div>
      </div>
    </main>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="text-xs font-mono text-neutral-500">{n}</div>
      <div className="mt-1 text-neutral-100 font-medium">{title}</div>
      <p className="mt-2 leading-relaxed">{children}</p>
    </div>
  );
}
