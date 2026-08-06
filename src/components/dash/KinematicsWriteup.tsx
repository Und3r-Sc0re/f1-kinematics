"use client";

import { useState } from "react";

/**
 * The teaching layer.
 *
 * Each entry ties one kinematics concept to the exact readout or graph it drives
 * on screen, so the physics is not just described — it is pointed at. Collapsible
 * so it can be tucked away once read.
 */
const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Position & displacement",
    body: (
      <>
        The car&rsquo;s <b>position</b> is three numbers — northing, easting and
        altitude — updated every frame from its velocity. <b>Distance</b> is the
        total path length driven (the odometer); <b>displacement</b> is the straight
        line from start to now. Drive a full lap and the distance grows while the
        displacement returns to zero. The <i>Position</i> block and minimap show both.
      </>
    ),
  },
  {
    title: "Velocity vs. speed",
    body: (
      <>
        <b>Speed</b> is how fast (the big cyan number); <b>velocity</b> is speed{" "}
        <i>with a direction</i> — the heading. On a straight the two agree, but the
        instant you turn, the velocity changes even at constant speed, because its
        direction is changing. That is the whole reason a corner is &ldquo;work&rdquo;.
        Position each step is <span className="tnum">Δs = v·Δt</span>.
      </>
    ),
  },
  {
    title: "Acceleration a = Δv/Δt",
    body: (
      <>
        Any change in velocity is acceleration. It has two components here.{" "}
        <b>Longitudinal</b> — throttle adds it, braking removes it (negative
        acceleration) — is the red trace and the vertical axis of the g-meter.
        Speed integrates from it: <span className="tnum">v = u + a·Δt</span>. Braking
        distance follows <span className="tnum">v² = u² + 2as</span>, which is why
        stopping from twice the speed takes four times the room.
      </>
    ),
  },
  {
    title: "Cornering: aₙ = v²/r",
    body: (
      <>
        Turning is <b>centripetal acceleration</b>, pointed at the centre of the
        corner — the lateral (orange) trace. It grows with the <i>square</i> of speed,
        so the tyre grip caps how fast a given radius can be taken:{" "}
        <span className="tnum">v = √(a·r)</span>. Push past that and the car runs
        wide. The steering itself is a bicycle model — yaw rate{" "}
        <span className="tnum">ω = v·tan(δ)/L</span> — capped by grip, so it turns
        sharply when slow and gently when fast.
      </>
    ),
  },
  {
    title: "The grip budget",
    body: (
      <>
        A tyre has one pool of grip to spend on turning <i>or</i> on
        accelerating/braking — the friction circle. Trail the brake into a corner
        and less is left to slow down; that trade is why the g-meter dot rides the
        rim rather than pinning to one axis. The track edge is a hard barrier: carry
        too much speed into a corner and you run out of asphalt and hit the wall,
        which is the whole point of braking in a straight line first.
      </>
    ),
  },
  {
    title: "Weight transfer",
    body: (
      <>
        Acceleration moves load between the tyres: <span className="tnum">ΔW = m·a·h/L</span>.
        Braking throws it forward, power to the rear, cornering to the outside — the
        four corner boxes show it live, and it is what makes the nose dive, the tail
        squat and the body lean into a turn. More load also heats a tyre, which raises
        its pressure by <span className="tnum">P ∝ T</span>.
      </>
    ),
  },
];

export function KinematicsWriteup() {
  const [open, setOpen] = useState(true);

  return (
    <section className="flex flex-col gap-3 border border-line bg-surface-2/40 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 text-left"
      >
        <span className="flex items-baseline gap-2">
          <span className="label">The kinematics of a lap</span>
        </span>
        <span className="font-mono text-[0.7rem] text-dim">{open ? "hide −" : "show +"}</span>
      </button>

      {open ? (
        <>
          <p className="text-[0.72rem] leading-relaxed text-muted">
            Nothing on this dashboard is scripted. The car is stepped forward from the
            same equations of motion you meet in kinematics — every number here is a
            direct read-out of one of them.
          </p>
          <div className="flex flex-col divide-y divide-line">
            {SECTIONS.map((s) => (
              <article key={s.title} className="flex flex-col gap-1.5 py-3 first:pt-1">
                <h3 className="font-[family-name:var(--font-display)] text-[0.82rem] tracking-tight text-ink">
                  {s.title}
                </h3>
                <p className="text-[0.7rem] leading-relaxed text-dim [&_b]:font-medium [&_b]:text-muted [&_i]:not-italic [&_i]:text-muted">
                  {s.body}
                </p>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
