import path from "node:path";

import type { NextConfig } from "next";

const repoRoot = path.resolve(import.meta.dirname, "../..");

// Local development keeps one .env.local at the repository root. In production the variables
// come from the server's environment (see docs/deploy.md) and this file does not exist.
try {
  process.loadEnvFile(path.join(repoRoot, ".env.local"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const nextConfig: NextConfig = {
  // Workspace packages export TypeScript source; Next compiles them.
  transpilePackages: [
    "@haycupo/core",
    "@haycupo/db",
    "@haycupo/notify",
    "@haycupo/siiau",
    "@haycupo/engine",
  ],
  outputFileTracingRoot: repoRoot,
  // A self-contained server (server.js plus only the files it needs) for the Docker image.
  output: "standalone",
  typedRoutes: true,
  poweredByHeader: false,
  headers() {
    return Promise.resolve([
      {
        // Browsers must always get the newest service worker, and it may only load our code.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]);
  },
};

export default nextConfig;
