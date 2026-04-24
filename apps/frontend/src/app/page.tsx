import Link from "next/link";

export default function Home() {
  return (
    <main
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{ background: "#0d0b08" }}
    >
      {/* ── Left curtain panel — starts closed (right edge past center), opens left ── */}
      <div
        aria-hidden
        className="curtain-left absolute left-0 top-0 bottom-0 z-30 pointer-events-none"
        style={{
          width: "52vw",
          background: `repeating-linear-gradient(
            to right,
            #2a0606 0px,
            #551010 9px,
            #420c0c 19px,
            #681313 28px,
            #3a0909 38px,
            #2a0606 50px
          )`,
          boxShadow: "inset -32px 0 50px rgba(0,0,0,0.65), 16px 0 44px rgba(0,0,0,0.5)",
        }}
      />

      {/* ── Right curtain panel — starts closed (left edge past center), opens right ── */}
      <div
        aria-hidden
        className="curtain-right absolute right-0 top-0 bottom-0 z-30 pointer-events-none"
        style={{
          width: "52vw",
          background: `repeating-linear-gradient(
            to left,
            #2a0606 0px,
            #551010 9px,
            #420c0c 19px,
            #681313 28px,
            #3a0909 38px,
            #2a0606 50px
          )`,
          boxShadow: "inset 32px 0 50px rgba(0,0,0,0.65), -16px 0 44px rgba(0,0,0,0.5)",
        }}
      />

      {/* ── Spotlight — outer diffuse halo ── */}
      <div
        aria-hidden
        className="spotlight-flicker pointer-events-none absolute left-1/2 -translate-x-1/2 top-0 z-10"
        style={{
          width: "min(820px, 62vw)",
          height: "78vh",
          clipPath: "polygon(36% 0%, 64% 0%, 93% 100%, 7% 100%)",
          background:
            "linear-gradient(to bottom, rgba(255,215,100,0.32) 0%, rgba(255,185,60,0.13) 48%, transparent 80%)",
          filter: "blur(28px)",
        }}
      />
      {/* ── Spotlight — inner focused beam ── */}
      <div
        aria-hidden
        className="spotlight-flicker pointer-events-none absolute left-1/2 -translate-x-1/2 top-0 z-10"
        style={{
          width: "min(400px, 32vw)",
          height: "68vh",
          clipPath: "polygon(40% 0%, 60% 0%, 83% 100%, 17% 100%)",
          background:
            "linear-gradient(to bottom, rgba(255,240,170,0.28) 0%, rgba(255,215,90,0.09) 55%, transparent 100%)",
          filter: "blur(8px)",
          animationDelay: "0.18s",
        }}
      />

      {/* ── Proscenium arch ── */}
      <div
        className="relative z-30 flex-shrink-0 w-full flex items-center justify-center"
        style={{
          height: "52px",
          background: "linear-gradient(to bottom, #120d06, #0e0a05)",
          borderBottom: "1px solid #2b1a08",
        }}
      >
        <p className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "#3e2a12" }}>
          Rehearsal
        </p>
      </div>

      {/* ── Stage content ── */}
      <div
        className="relative z-20 flex-1 flex flex-col items-center justify-center text-center"
        style={{ padding: "40px clamp(72px, 21%, 280px) 32px" }}
      >
        <h1
          className="font-semibold leading-[1.08] tracking-tight"
          style={{ fontSize: "clamp(2rem, 4.5vw, 3.5rem)", color: "#f5f0e8" }}
        >
          Pilots don&apos;t practice on real planes.
          <br />
          <span style={{ color: "#7a6242", fontSize: "0.82em" }}>
            Stop practicing high-stakes conversations on reality.
          </span>
        </h1>

        <p
          className="mt-8 leading-relaxed"
          style={{ fontSize: "clamp(1rem, 1.6vw, 1.2rem)", color: "#c09a50" }}
        >
          Step into the rehearsal before the room is real.
        </p>

        <div
          className="mt-10"
          style={{
            width: "160px",
            height: "1px",
            background: "linear-gradient(to right, transparent, #4a3018, transparent)",
          }}
        />

        <ul className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3">
          {["Know the room", "Find the hard question", "Practice the moment"].map((cue) => (
            <li
              key={cue}
              className="flex items-center gap-2.5 text-sm"
              style={{ color: "#7a5f38" }}
            >
              <span
                className="block flex-shrink-0"
                style={{ width: "14px", height: "1px", background: "#bf7828" }}
              />
              {cue}
            </li>
          ))}
        </ul>

        <div className="mt-10">
          <Link
            href="/new"
            className="cta-btn inline-flex items-center gap-2 rounded-md px-6 py-3.5 text-sm font-medium"
          >
            Start a rehearsal
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>

      {/* ── Stage floor ── */}
      <div
        aria-hidden
        className="pointer-events-none relative z-10 flex-shrink-0 w-full overflow-hidden"
        style={{ height: "clamp(130px, 26vh, 320px)" }}
      >
        <div
          style={{
            width: "140%",
            height: "220%",
            marginLeft: "-20%",
            transform: "perspective(560px) rotateX(40deg)",
            transformOrigin: "bottom center",
            background: `repeating-linear-gradient(
              to bottom,
              #1b1107 0px,
              #1b1107 26px,
              #231607 26px,
              #231607 28px
            )`,
            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 22%, black 68%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, black 22%, black 68%, transparent 100%)",
          }}
        />
      </div>
    </main>
  );
}
