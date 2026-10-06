/**
 * pnpm --filter @haycupo/web build:functions
 *
 * Compiles the Netlify functions in netlify-functions/ into plain JavaScript in
 * netlify/functions/, which Netlify then packages. Netlify's own bundler leaves workspace
 * packages (TypeScript source) as imports that do not exist at runtime, so everything is
 * inlined here except libSQL, whose native binary Netlify ships as a module
 * (external_node_modules in netlify.toml).
 */
import path from "node:path";

import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");

await build({
  entryPoints: [path.join(root, "netlify-functions/poll.ts")],
  outdir: path.join(root, "netlify/functions"),
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["@libsql/client", "libsql"],
  // Some bundled dependencies are CommonJS and call require().
  banner: {
    js: 'import { createRequire as ___createRequire } from "node:module"; const require = ___createRequire(import.meta.url);',
  },
  logLevel: "info",
});
