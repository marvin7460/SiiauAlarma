import { defineConfig } from "drizzle-kit";

// `generate` only reads the schema; `push` and `studio` connect with these credentials.
export default defineConfig({
  dialect: "turso",
  schema: "./src/schema",
  out: "./migrations",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "file:../../data/local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
