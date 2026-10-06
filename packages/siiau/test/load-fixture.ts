import { existsSync, readdirSync, readFileSync } from "node:fs";

import { decodeSiiauBody } from "../src/encoding";

const FIXTURES_DIR = new URL("./fixtures/", import.meta.url);
const SYNTHETIC_DIR = new URL("./fixtures/synthetic/", import.meta.url);

/** Raw bytes of a fixture, exactly as stored. */
export function readFixtureBytes(name: string, dir: URL = FIXTURES_DIR): Uint8Array {
  return new Uint8Array(readFileSync(new URL(name, dir)));
}

/** A hand-written fixture from test/fixtures/synthetic, decoded like a SIIAU response. */
export function loadSyntheticFixture(name: string): string {
  return decodeSiiauBody(readFixtureBytes(name, SYNTHETIC_DIR));
}

export interface RealFixture {
  name: string;
  html: string;
  meta: { request: { url: string }; response: { status: number; headers: Record<string, string> } };
}

/** Real captures saved by `pnpm capture` whose name matches `prefix` (none until captured). */
export function listRealFixtures(prefix: string): RealFixture[] {
  if (!existsSync(FIXTURES_DIR)) return [];
  return readdirSync(FIXTURES_DIR)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".html"))
    .map((file) => {
      const base = file.slice(0, -".html".length);
      const meta = JSON.parse(
        readFileSync(new URL(`${base}.meta.json`, FIXTURES_DIR), "utf8"),
      ) as RealFixture["meta"];
      const html = decodeSiiauBody(
        readFixtureBytes(file),
        meta.response.headers["content-type"] ?? null,
      );
      return { name: base, html, meta };
    });
}
