"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTicker } from "@/lib/sim/ticker";
import { sim, trail } from "@/lib/sim/state";

/**
 * Draws the path the car has actually taken.
 *
 * The circuit model carries no centreline data — its meshes are unnamed — so
 * rather than guess at one, the map plots the breadcrumb trail. The layout of
 * the Nürburgring emerges as you drive it, and the view auto-fits whatever has
 * been covered so far.
 */
export function MiniMap({ height = 190 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: height, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      size.current = { w: rect.width, h: height, dpr };
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
    const { w, h, dpr } = size.current;
    if (w === 0) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (trail.length < 2) {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText("Drive to trace the circuit", 10, h / 2);
      return;
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of trail) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const pad = 12;
    const spanX = Math.max(40, maxX - minX);
    const spanZ = Math.max(40, maxZ - minZ);
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
    const offX = (w - spanX * scale) / 2 - minX * scale;
    // Negated so that +Z on the circuit runs up the screen.
    const offY = (h + spanZ * scale) / 2 + minZ * scale;
    const px = (x: number) => x * scale + offX;
    const py = (z: number) => offY - z * scale;

    ctx.beginPath();
    ctx.moveTo(px(trail[0].x), py(trail[0].z));
    for (let i = 1; i < trail.length; i++) ctx.lineTo(px(trail[i].x), py(trail[i].z));
    ctx.strokeStyle = "rgba(0,210,190,0.55)";
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    ctx.stroke();

    const cx = px(sim.position.x);
    const cy = py(sim.position.z);
    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#ff8a00";
    ctx.shadowColor = "#ff8a00";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Heading tick.
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(sim.yaw) * 10, cy - Math.cos(sim.yaw) * 10);
    ctx.strokeStyle = "#ff8a00";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }, []);

  useTicker(draw, 15);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height }}
      role="img"
      aria-label="Map of the path driven so far"
    />
  );
}
