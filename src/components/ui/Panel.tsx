import type { ReactNode } from "react";
import { clsx } from "@/lib/utils/clsx";

/**
 * The single surface used across the whole interface. Corner ticks come from
 * instrumentation UI — they read as a machined bezel rather than a card.
 */
export function Panel({
  children,
  className,
  accent,
  ticks = true,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
  ticks?: boolean;
  as?: "div" | "section" | "aside" | "li";
}) {
  return (
    <Tag className={clsx("panel relative min-w-0 rounded-sm", className)}>
      {accent ? (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-px w-full"
          style={{ background: `linear-gradient(90deg, ${accent}, transparent 65%)` }}
        />
      ) : null}
      {ticks ? <CornerTicks /> : null}
      {children}
    </Tag>
  );
}

function CornerTicks() {
  const base = "absolute h-2 w-2 border-line-strong pointer-events-none";
  return (
    <span aria-hidden>
      <span className={`${base} left-0 top-0 border-l border-t`} />
      <span className={`${base} right-0 top-0 border-r border-t`} />
      <span className={`${base} bottom-0 left-0 border-b border-l`} />
      <span className={`${base} bottom-0 right-0 border-b border-r`} />
    </span>
  );
}
