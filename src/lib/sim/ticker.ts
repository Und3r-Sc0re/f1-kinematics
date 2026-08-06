"use client";

import { useEffect } from "react";

type Sub = { fn: (t: number) => void; interval: number; last: number };

const subs = new Set<Sub>();
let raf = 0;

function loop(now: number) {
  raf = requestAnimationFrame(loop);
  for (const sub of subs) {
    if (now - sub.last >= sub.interval) {
      sub.last = now;
      sub.fn(now);
    }
  }
}

/**
 * One shared animation loop for every live readout and chart.
 *
 * The dashboard has dozens of elements that need refreshing continuously.
 * Giving each its own `requestAnimationFrame` would mean dozens of callbacks
 * competing with the render loop; this runs a single frame callback and fans out
 * to subscribers at whatever rate each one actually needs.
 */
export function useTicker(fn: (t: number) => void, hz = 20) {
  useEffect(() => {
    const sub: Sub = { fn, interval: 1000 / hz, last: 0 };
    subs.add(sub);
    if (!raf) raf = requestAnimationFrame(loop);
    return () => {
      subs.delete(sub);
      if (subs.size === 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
  }, [fn, hz]);
}
