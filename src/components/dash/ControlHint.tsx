"use client";

import { useEffect, useState } from "react";
import { onCommand } from "@/lib/sim/input";

const KEYS = [
  ["W", "Throttle"],
  ["S", "Brake / reverse"],
  ["A", "Left"],
  ["D", "Right"],
  ["Space", "Handbrake"],
  ["C", "Camera"],
  ["R", "Reset"],
];

/**
 * Controls overlay. Shown until the driver does something, then it gets out of
 * the way — it is only useful once.
 */
export function ControlHint() {
  const [dismissed, setDismissed] = useState(false);
  const [camera, setCamera] = useState(0);

  useEffect(() => {
    const hide = (e: KeyboardEvent) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown"].includes(e.code)) {
        setDismissed(true);
      }
    };
    window.addEventListener("keydown", hide);
    return () => window.removeEventListener("keydown", hide);
  }, []);

  useEffect(() => onCommand((c) => c === "camera" && setCamera((n) => n + 1)), []);

  return (
    <>
      <div
        className={`pointer-events-none absolute left-4 top-4 transition-opacity duration-700 ${
          dismissed ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="panel rounded-sm px-3 py-2.5">
          <span className="label mb-2 block">Controls</span>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1">
            {KEYS.map(([key, action]) => (
              <div key={key} className="contents">
                <dt className="tnum border border-line px-1.5 text-[0.6rem] text-ink">{key}</dt>
                <dd className="text-[0.65rem] text-dim">{action}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <span className="pointer-events-none absolute bottom-3 right-4 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-dim">
        Arctic Circuit · {["Chase", "Onboard", "High"][camera % 3]}
      </span>
    </>
  );
}
