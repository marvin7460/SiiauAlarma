import path from "node:path";

import type { NextConfig } from "next";

const repoRoot = path.resolve(import.meta.dirname, "../..");

// Local development keeps one .env.local at the repository root, shared with the worker.
// On Vercel, variables come from the project settings and this file does not exist.
try {
  process.loadEnvFile(path.join(repoRoot, ".env.local"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const nextConfig: NextConfig = {
  // Workspace packages export TypeScript source; Next compiles them.
  transpilePackages: ["@haycupo/db", "@haycupo/siiau", "@haycupo/worker"],
  outputFileTracingRoot: repoRoot,
  typedRoutes: true,
  poweredByHeader: false,
};

export default nextConfig;
