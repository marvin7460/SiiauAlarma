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

const dev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy: everything comes from this site. Scripts allow 'unsafe-inline'
 * because Next.js writes its page data as inline scripts; a nonce instead would need a proxy
 * (middleware) on every request. The rest still holds: no scripts, frames, plugins or form
 * targets from anywhere else, and no framing of our pages (clickjacking). See docs/security.md.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  // "Conectar Telegram" ends in a redirect to t.me.
  "form-action 'self' https://t.me",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // HTTPS only, for two years (ignored over plain HTTP, e.g. in development).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

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
  // Not used at runtime, and heavy (~45 MB): the image optimizer (this app has no next/image)
  // and libSQL's musl build (Netlify and the Docker image are glibc). Smaller functions start
  // faster, and on Netlify start-up time is billed.
  // pnpm keeps them in the repository root's node_modules/.pnpm, hence the ../../ prefix.
  outputFileTracingExcludes: {
    "*": [
      "../../node_modules/.pnpm/@img+*/**",
      "../../node_modules/.pnpm/@libsql+linux-*-musl@*/**",
    ],
  },
  typedRoutes: true,
  poweredByHeader: false,
  headers() {
    return Promise.resolve([
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // The sign-in link's token is in this page's URL: never send it anywhere, never cache it.
        source: "/entrar/confirmar",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
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
