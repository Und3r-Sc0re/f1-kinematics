"use client";

import { useCallback, useRef } from "react";
import { Live, LiveBar } from "./Live";
import { useTicker } from "@/lib/sim/ticker";
import { sim } from "@/lib/sim/state";
import { CAR, G, RPM_MAX, msToKmh, toG } from "@/lib/sim/spec";
import { clsx } from "@/lib/utils/clsx";

const WHEELS = [
  { i: 0, label: "FL" },
  { i: 1, label: "FR" },
  { i: 2, label: "RL" },
  { i: 3, label: "RR" },
] as const;

/**
 * The instrument cluster, sitting directly beneath the race view.
 *
 * Everything here is written to the DOM from the simulation on a shared ticker
 * rather than through React state.
 */
export function TelemetryStrip() {
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-line bg-surface/70 p-3 lg:grid-cols-[auto_auto_1fr_auto]">
      <SpeedBlock />
      <GearBlock />
      <PedalsAndG />
      <WheelGrid />
    </div>
  );
}

function SpeedBlock() {
  return (
    <div className="flex flex-col justify-between gap-1">
      <span className="label">Speed</span>
      <div className="flex items-baseline gap-1.5">
        <Live
          get={() => Math.abs(msToKmh(sim.speed))}
          className="text-5xl font-medium leading-none text-[var(--color-cyan)]"
          hz={30}
        />
        <span className="label">km/h</span>
      </div>
      <ShiftLights />
      <SurfaceTag />
    </div>
  );
}

const SURFACE_LABEL: Record<string, { text: string; color: string }> = {
  asphalt: { text: "ON TRACK", color: "var(--color-drs)" },
  kerb: { text: "KERB", color: "var(--color-amber)" },
  grass: { text: "OFF · GRASS", color: "var(--color-papaya)" },
  offtrack: { text: "OFF TRACK", color: "var(--color-ferrari)" },
};

/** Track-limits indicator — flashes a barrier warning on an edge impact. */
function SurfaceTag() {
  const ref = useRef<HTMLSpanElement>(null);
  const tick = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    if (sim.impact > 0.05) {
      const text = "⚠ BARRIER";
      if (node.textContent !== text) node.textContent = text;
      node.style.color = "var(--color-ferrari)";
      node.style.borderColor = "var(--color-ferrari)";
      node.style.opacity = String(0.5 + 0.5 * sim.impact);
      return;
    }
    node.style.opacity = "1";
    const info = SURFACE_LABEL[sim.surface] ?? SURFACE_LABEL.asphalt;
    if (node.textContent !== info.text) node.textContent = info.text;
    node.style.color = info.color;
    node.style.borderColor = info.color;
  }, []);
  useTicker(tick, 20);
  return (
    <span
      ref={ref}
      className="mt-1 w-fit border px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em]"
    />
  );
}

/** RPM strip that turns amber then red as the limiter approaches. */
function ShiftLights() {
  const ref = useRef<HTMLDivElement>(null);
  const tick = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const frac = Math.min(1, sim.rpm / RPM_MAX);
    const cells = node.children;
    for (let i = 0; i < cells.length; i++) {
      const on = frac > (i + 0.5) / cells.length;
      const cell = cells[i] as HTMLElement;
      const color = i < 6 ? "var(--color-drs)" : i < 9 ? "var(--color-amber)" : "var(--color-ferrari)";
      cell.style.background = on ? color : "var(--color-surface-3)";
      cell.style.boxShadow = on ? `0 0 6px ${color}` : "none";
    }
  }, []);
  useTicker(tick, 30);
  return (
    <div ref={ref} className="mt-2 flex gap-[3px]" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className="h-1.5 w-2.5 rounded-[1px] bg-surface-3" />
      ))}
    </div>
  );
}

function GearBlock() {
  const gearText = useCallback(
    () => (sim.gear === 0 ? -1 : sim.gear),
    [],
  );
  return (
    <div className="flex flex-col justify-between border-l border-line pl-3">
      <span className="label">Gear</span>
      <Live
        get={gearText}
        format={(v) => (v < 0 ? "R" : String(Math.round(v)))}
        className="text-5xl font-medium leading-none text-ink"
        hz={20}
      />
      <div className="flex items-baseline gap-1">
        <Live
          get={() => sim.rpm}
          format={(v) => Math.round(v).toLocaleString()}
          className="text-[0.7rem] text-muted"
        />
        <span className="label">rpm</span>
      </div>
    </div>
  );
}

function PedalsAndG() {
  return (
    <div className="flex items-stretch gap-4 border-l border-line pl-3">
      <div className="flex flex-1 flex-col justify-between gap-1.5">
        <Pedal label="Throttle" get={() => sim.throttle} color="var(--color-drs)" />
        <Pedal label="Brake" get={() => sim.brake} color="var(--color-ferrari)" />
        <Pedal
          label="Steering"
          get={() => (sim.steer + 1) / 2}
          color="var(--color-cyan)"
          centered
        />
      </div>
      <GMeter />
    </div>
  );
}

function Pedal({
  label,
  get,
  color,
  centered = false,
}: {
  label: string;
  get: () => number;
  color: string;
  centered?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="label w-14 shrink-0">{label}</span>
      {centered ? <CenteredBar get={get} color={color} /> : (
        <LiveBar get={get} color={color} className="h-1.5 flex-1" />
      )}
    </div>
  );
}

/** Steering reads outward from the centre, so lock direction is visible. */
function CenteredBar({ get, color }: { get: () => number; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const tick = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const v = get() * 2 - 1;
    const pct = Math.abs(v) * 50;
    node.style.left = v >= 0 ? "50%" : `${50 - pct}%`;
    node.style.width = `${pct}%`;
  }, [get]);
  useTicker(tick, 30);
  return (
    <div className="relative h-1.5 flex-1 overflow-hidden bg-surface-3">
      <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
      <div ref={ref} className="absolute inset-y-0" style={{ background: color }} />
    </div>
  );
}

/** Combined g-force trace — the friction circle, drawn live. */
function GMeter() {
  const dot = useRef<HTMLDivElement>(null);
  const tick = useCallback(() => {
    const node = dot.current;
    if (!node) return;
    const x = Math.max(-1, Math.min(1, toG(sim.aLat) / 5));
    const y = Math.max(-1, Math.min(1, toG(sim.aLong) / 5));
    node.style.transform = `translate(${x * 50}%, ${-y * 50}%)`;
  }, []);
  useTicker(tick, 30);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-16 w-16 rounded-full border border-line">
        <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
        <span className="absolute inset-[25%] rounded-full border border-line" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            ref={dot}
            className="h-2 w-2 rounded-full bg-[var(--color-papaya)]"
            style={{ boxShadow: "0 0 8px var(--color-papaya)" }}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <span className="label">
          <Live get={() => Math.abs(toG(sim.aLat))} format={(v) => v.toFixed(1)} /> lat
        </span>
        <span className="label">
          <Live get={() => toG(sim.aLong)} format={(v) => v.toFixed(1)} /> lon
        </span>
      </div>
    </div>
  );
}

/**
 * The four corner boxes: vertical load, surface temperature and hot pressure
 * for each tyre. Load is what the contact patch is actually carrying — static
 * weight plus downforce plus whatever the load transfer has just moved onto it.
 */
function WheelGrid() {
  return (
    <div className="grid grid-cols-2 gap-1.5 border-l border-line pl-3">
      {WHEELS.map((w) => (
        <WheelBox key={w.label} index={w.i} label={w.label} />
      ))}
    </div>
  );
}

const STATIC_LOAD = (CAR.mass * G) / 4;

function WheelBox({ index, label }: { index: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  const tick = useCallback(() => {
    const wheel = sim.wheels[index];
    if (bar.current) {
      // Scaled against three times static load, roughly the peak an F1 tyre sees.
      bar.current.style.width = `${Math.min(100, (wheel.load / (STATIC_LOAD * 3)) * 100)}%`;
    }
    if (box.current) {
      const t = wheel.temperature;
      const color =
        t < 70 ? "var(--color-cyan)" : t < 90 ? "var(--color-drs)" : t < 115 ? "var(--color-amber)" : "var(--color-ferrari)";
      box.current.style.borderColor = color;
      box.current.style.setProperty("--wheel-accent", color);
    }
  }, [index]);

  useTicker(tick, 20);

  return (
    <div
      ref={box}
      className={clsx("flex min-w-[6.5rem] flex-col gap-1 border bg-surface-2/60 px-2 py-1.5")}
      style={{ borderColor: "var(--color-line)" }}
    >
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="tnum text-[0.65rem]" style={{ color: "var(--wheel-accent, var(--color-muted))" }}>
          <Live get={() => sim.wheels[index].temperature} format={(v) => `${v.toFixed(0)}°`} />
        </span>
      </div>
      <div className="relative h-1 overflow-hidden bg-surface-3">
        <div
          ref={bar}
          className="absolute inset-y-0 left-0"
          style={{ background: "var(--wheel-accent, var(--color-cyan))" }}
        />
      </div>
      <div className="flex items-baseline justify-between">
        <span className="tnum text-[0.6rem] text-dim">
          <Live get={() => sim.wheels[index].load} format={(v) => `${(v / 1000).toFixed(1)}kN`} />
        </span>
        <span className="tnum text-[0.6rem] text-muted">
          <Live get={() => sim.wheels[index].pressure} format={(v) => `${v.toFixed(1)}psi`} />
        </span>
      </div>
    </div>
  );
}
