/**
 * Prefixes a root-relative asset path with the deployment's base path.
 *
 * Next's `basePath` config rewrites paths it generates itself (JS chunks,
 * `next/image`, `next/link`) but not arbitrary strings handed to `fetch` or a
 * GLTF loader — those are used exactly as written. On GitHub Pages the whole
 * site lives under `/f1-kinematics`, so every hardcoded `/models/...` and
 * `/draco/...` reference needs that prefix, and this is the one place it's
 * applied.
 */
export function assetPath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}${path}`;
}
