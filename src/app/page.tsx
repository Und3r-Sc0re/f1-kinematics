import dynamic from "next/dynamic";
import { TelemetryStrip } from "@/components/dash/TelemetryStrip";
import { GraphPanel } from "@/components/dash/GraphPanel";
import { ControlHint } from "@/components/dash/ControlHint";

// WebGL is client-only, and there is no point shipping three.js to a render
// that cannot use it.
const RaceView = dynamic(() => import("@/components/race/RaceView").then((m) => m.RaceView), {
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <span className="label animate-pulse">Loading circuit…</span>
    </div>
  ),
});

/**
 * Two columns on a single screen: the car on the left with its instruments
 * directly beneath, and the telemetry stack scrolling independently on the
 * right. Neither column scrolls the page — the document itself never moves,
 * so the race view is always visible while you read the graphs.
 */
export default function Home() {
  return (
    <main className="grid h-[100svh] w-full grid-rows-[1fr_auto] overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(360px,42%)] lg:grid-rows-1">
      {/* Left: race + instruments. */}
      <section
        className="flex min-h-0 min-w-0 flex-col lg:row-span-1"
        aria-label="Race view and instruments"
      >
        <div className="relative min-h-0 flex-1 bg-[#0a0d12]">
          <RaceView />
          <ControlHint />
        </div>
        <TelemetryStrip />
      </section>

      {/* Right: scrolling telemetry. */}
      <aside
        className="min-h-0 border-t border-line bg-surface/40 lg:border-l lg:border-t-0"
        aria-label="Telemetry graphs"
      >
        <GraphPanel />
      </aside>
    </main>
  );
}
