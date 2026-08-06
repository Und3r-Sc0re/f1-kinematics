"use client";

import { LiveChart } from "@/components/charts/LiveChart";
import { MiniMap } from "./MiniMap";
import { KinematicsWriteup } from "./KinematicsWriteup";
import { Live } from "./Live";
import { sim } from "@/lib/sim/state";
import { formatTime, msToKmh, toG } from "@/lib/sim/spec";

const CYAN = "#00d2be";
const PAPAYA = "#ff8a00";
const FERRARI = "#ff2d16";
const DRS = "#00ff87";
const AMBER = "#ffc400";
const WHITE = "#dfe3e8";

/**
 * The scrolling telemetry column.
 *
 * Every plot reads from the same ring buffer the simulation writes to, so they
 * are all showing the same instant without any synchronisation between them.
 */
export function GraphPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-ferrari)]"
            style={{ boxShadow: "0 0 8px var(--color-ferrari)" }}
          />
          <span className="label">Live telemetry</span>
        </div>
        <div className="flex gap-4">
          <Stat label="Session" get={() => sim.time} format={formatTime} />
          <Stat
            label="Distance"
            get={() => sim.odometer / 1000}
            format={(v) => `${v.toFixed(2)} km`}
          />
          <Stat
            label="Top"
            get={() => msToKmh(sim.topSpeed)}
            format={(v) => `${v.toFixed(0)} km/h`}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="flex flex-col gap-6 pb-8">
          <KinematicsWriteup />

          <Group title="Motion">
            <LiveChart
              title="Speed"
              unit="km/h"
              min={0}
              max={360}
              height={110}
              series={[{ channel: "speed", color: CYAN, label: "v", fill: true }]}
            />
            <LiveChart
              title="Longitudinal acceleration"
              unit="g"
              min={-6.5}
              max={2}
              zeroLine
              series={[{ channel: "aLong", color: FERRARI, label: "long", fill: true }]}
              format={(v) => v.toFixed(2)}
            />
            <LiveChart
              title="Lateral acceleration"
              unit="g"
              min={-5}
              max={5}
              zeroLine
              series={[{ channel: "aLat", color: PAPAYA, label: "lat", fill: true }]}
              format={(v) => v.toFixed(2)}
            />
            <LiveChart
              title="Elevation"
              unit="m"
              min={0}
              max={90}
              series={[{ channel: "elevation", color: WHITE, label: "alt", fill: true }]}
              format={(v) => v.toFixed(1)}
            />
            <LiveChart
              title="Grip — track limits"
              unit="%"
              min={0}
              max={100}
              series={[{ channel: "grip", color: DRS, label: "grip", fill: true }]}
            />
          </Group>

          <Group title="Driver inputs">
            <LiveChart
              title="Throttle and brake"
              unit="%"
              min={0}
              max={100}
              height={110}
              series={[
                { channel: "throttle", color: DRS, label: "thr" },
                { channel: "brake", color: FERRARI, label: "brk" },
              ]}
            />
            <LiveChart
              title="Steering"
              unit="%"
              min={-100}
              max={100}
              zeroLine
              series={[{ channel: "steer", color: CYAN, label: "steer" }]}
            />
            <LiveChart
              title="Slip angle"
              unit="deg"
              min={-15}
              max={15}
              zeroLine
              series={[{ channel: "slipAngle", color: AMBER, label: "slip" }]}
              format={(v) => v.toFixed(1)}
            />
          </Group>

          <Group title="Power unit">
            <LiveChart
              title="Engine speed"
              unit="rpm"
              min={0}
              max={15000}
              height={110}
              series={[{ channel: "rpm", color: AMBER, label: "rpm", fill: true }]}
              format={(v) => Math.round(v).toLocaleString()}
            />
            <LiveChart
              title="Gear"
              min={0}
              max={8}
              series={[{ channel: "gear", color: WHITE, label: "gear" }]}
            />
          </Group>

          <Group title="Tyre loads">
            <LiveChart
              title="Front axle load"
              unit="N"
              min={0}
              max={9000}
              height={110}
              series={[
                { channel: "loadFL", color: CYAN, label: "FL" },
                { channel: "loadFR", color: PAPAYA, label: "FR" },
              ]}
            />
            <LiveChart
              title="Rear axle load"
              unit="N"
              min={0}
              max={9000}
              height={110}
              series={[
                { channel: "loadRL", color: DRS, label: "RL" },
                { channel: "loadRR", color: FERRARI, label: "RR" },
              ]}
            />
          </Group>

          <Group title="Tyre temperature">
            <LiveChart
              title="Surface temperature"
              unit="°C"
              min={20}
              max={160}
              height={120}
              series={[
                { channel: "tempFL", color: CYAN, label: "FL" },
                { channel: "tempFR", color: PAPAYA, label: "FR" },
                { channel: "tempRL", color: DRS, label: "RL" },
                { channel: "tempRR", color: FERRARI, label: "RR" },
              ]}
            />
            <LiveChart
              title="Hot pressure"
              unit="psi"
              min={20}
              max={34}
              height={120}
              series={[
                { channel: "pressureFL", color: CYAN, label: "FL" },
                { channel: "pressureFR", color: PAPAYA, label: "FR" },
                { channel: "pressureRL", color: DRS, label: "RL" },
                { channel: "pressureRR", color: FERRARI, label: "RR" },
              ]}
              format={(v) => v.toFixed(1)}
            />
            <p className="text-[0.65rem] leading-relaxed text-dim">
              Pressure follows temperature by Gay-Lussac&rsquo;s law — at fixed volume
              P is proportional to absolute T. A tyre set at 22.5 psi cold reads
              several psi higher once it is working.
            </p>
          </Group>

          <Group title="Position">
            <MiniMap />
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Northing" get={() => sim.position.z} format={(v) => `${v.toFixed(0)} m`} />
              <Stat label="Easting" get={() => sim.position.x} format={(v) => `${v.toFixed(0)} m`} />
              <Stat label="Altitude" get={() => sim.position.y} format={(v) => `${v.toFixed(1)} m`} />
              <Stat
                label="Heading"
                get={() => ((sim.yaw * 180) / Math.PI + 360) % 360}
                format={(v) => `${v.toFixed(0)}°`}
              />
              <Stat label="Peak lat" get={() => Math.abs(toG(sim.aLat))} format={(v) => `${v.toFixed(2)} g`} />
              <Stat
                label="Surface"
                get={() => (sim.onTrack ? 1 : 0)}
                format={(v) => (v > 0.5 ? "Track" : "Off")}
              />
            </div>
          </Group>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="label border-b border-line pb-1.5">{title}</h2>
      {children}
    </section>
  );
}

function Stat({
  label,
  get,
  format,
}: {
  label: string;
  get: () => number;
  format: (v: number) => string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <Live get={get} format={format} className="text-xs text-muted" hz={10} />
    </div>
  );
}
