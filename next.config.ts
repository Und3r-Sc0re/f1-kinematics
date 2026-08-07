import type { NextConfig } from "next";

// GitHub Pages serves a project repo at https://<user>.github.io/<repo>/, so
// every asset URL needs that prefix baked in. Locally (`npm run dev`) there is
// no prefix — only the GitHub Pages build sets this env var (see
// .github/workflows/deploy.yml), and it is read directly with
// process.env.NEXT_PUBLIC_BASE_PATH in app code rather than through the `env`
// config key below, which Turbopack was not inlining into client bundles.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // Pages hosts static files only — no Node server for image optimization or
  // SSR, so the whole app is exported to plain HTML/JS/CSS.
  output: "export",
  basePath: BASE_PATH,
  images: { unoptimized: true },
};

export default nextConfig;
