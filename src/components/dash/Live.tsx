"use client";

import { useCallback, useRef } from "react";
import { useTicker } from "@/lib/sim/ticker";
import { clsx } from "@/lib/utils/clsx";

/**
 * A number that updates from the simulation without re-rendering React.
 *
 * The value is written straight to the node's text content on a shared ticker.
 * Routing sixty telemetry figures through React state at frame rate would
 * re-render the whole dashboard many times a second for no benefit — nothing
 * about the layout changes, only the digits.
 */
export function Live({
  get,
  format = (v) => v.toFixed(0),
  className,
  hz = 20,
}: {
  get: () => number;
  format?: (v: number) => string;
  className?: string;
  hz?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  const tick = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const next = format(get());
    if (node.textContent !== next) node.textContent = next;
  }, [get, format]);

  useTicker(tick, hz);

  return <span ref={ref} className={clsx("tnum", className)} />;
}

/** A bar whose fill tracks a live 0–1 value. */
export function LiveBar({
  get,
  color,
  vertical = false,
  className,
  hz = 30,
}: {
  get: () => number;
  color: string;
  vertical?: boolean;
  className?: string;
  hz?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const tick = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const pct = Math.max(0, Math.min(1, get())) * 100;
    if (vertical) node.style.height = `${pct}%`;
    else node.style.width = `${pct}%`;
  }, [get, vertical]);

  useTicker(tick, hz);

  return (
    <div className={clsx("relative overflow-hidden bg-surface-3", className)}>
      <div
        ref={ref}
        className={clsx("absolute", vertical ? "inset-x-0 bottom-0" : "inset-y-0 left-0")}
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
    </div>
  );
}
