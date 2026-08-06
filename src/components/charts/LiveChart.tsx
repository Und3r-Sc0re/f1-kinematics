"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTicker } from "@/lib/sim/ticker";
import { history, sim, type Channel } from "@/lib/sim/state";

export interface Series {
  channel: Channel;
  color: string;
  label: string;
  /** Draw a translucent fill down to the zero line. */
  fill?: boolean;
}

/**
 * Rolling time-series plot, drawn to a canvas.
 *
 * Canvas rather than SVG: the dashboard holds a dozen of these, each redrawing
 * a few hundred points several times a second. That is tens of thousands of DOM
 * nodes per second as SVG, and effectively free as immediate-mode drawing.
 *
 * Data is read straight from the telemetry ring buffer, so a chart costs nothing
 * to keep in sync — there is no copy of the history per chart.
 */
export function LiveChart({
  title,
  unit,
  series,
  min,
  max,
  window = 20,
  height = 96,
  zeroLine = false,
  format = (v) => v.toFixed(0),
}: {
  title: string;
  unit?: string;
  series: Series[];
  min: number;
  max: number;
  /** Seconds of history shown. */
  window?: number;
  height?: number;
  zeroLine?: boolean;
  format?: (v: number) => string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window_devicePixelRatio());
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      sizeRef.current = { w: rect.width, h: height, dpr };
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [height]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { w, h, dpr } = sizeRef.current;
    if (w === 0) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const span = max - min || 1;
    const yOf = (v: number) => h - ((v - min) / span) * h;

    // Grid.
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const y = Math.round((h / 4) * i) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    if (zeroLine && min < 0 && max > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath();
      const y = Math.round(yOf(0)) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const count = history.count;
    if (count < 2) return;

    const now = sim.time;
    const from = now - window;

    for (const s of series) {
      const data = history.data[s.channel];
      ctx.beginPath();
      let started = false;
      let firstX = 0;
      let lastX = 0;

      for (let i = 0; i < count; i++) {
        const idx = history.indexAt(i);
        const t = history.time[idx];
        if (t < from) continue;
        const x = ((t - from) / window) * w;
        const y = yOf(Math.max(min, Math.min(max, data[idx])));
        if (!started) {
          ctx.moveTo(x, y);
          firstX = x;
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
        lastX = x;
      }
      if (!started) continue;

      if (s.fill) {
        const baseline = yOf(Math.max(min, Math.min(max, 0)));
        ctx.save();
        ctx.lineTo(lastX, baseline);
        ctx.lineTo(firstX, baseline);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, `${s.color}44`);
        grad.addColorStop(1, `${s.color}00`);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
        // Re-trace so the stroke is not closed by the fill path.
        ctx.beginPath();
        started = false;
        for (let i = 0; i < count; i++) {
          const idx = history.indexAt(i);
          const t = history.time[idx];
          if (t < from) continue;
          const x = ((t - from) / window) * w;
          const y = yOf(Math.max(min, Math.min(max, data[idx])));
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        }
      }

      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.4;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }, [series, min, max, window, zeroLine]);

  useTicker(draw, 30);

  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="label">
          {title}
          {unit ? <span className="ml-1 normal-case tracking-normal">({unit})</span> : null}
        </span>
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          {series.map((s) => (
            <span key={s.channel} className="flex items-center gap-1.5">
              <span aria-hidden className="h-px w-3" style={{ background: s.color }} />
              <span className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">
                {s.label}
              </span>
              <LiveValue channel={s.channel} color={s.color} format={format} />
            </span>
          ))}
        </span>
      </figcaption>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height }}
        role="img"
        aria-label={`${title} over the last ${window} seconds`}
      />
      <span className="label self-end text-[0.5rem]">last {window}s</span>
    </figure>
  );
}

function LiveValue({
  channel,
  color,
  format,
}: {
  channel: Channel;
  color: string;
  format: (v: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const tick = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const next = format(history.latest(channel));
    if (node.textContent !== next) node.textContent = next;
  }, [channel, format]);
  useTicker(tick, 15);
  return <span ref={ref} className="tnum text-[0.65rem]" style={{ color }} />;
}

/** devicePixelRatio, guarded for server rendering. */
function window_devicePixelRatio() {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}
