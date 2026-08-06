type ClassValue = string | false | null | undefined;

/** Minimal class joiner — the project needs nothing more than this. */
export function clsx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
