import { describe, expect, it } from "vitest";

import { normalizeEmail, randomToken, safeNext, sha256Hex } from "./tokens";

describe("randomToken", () => {
  it("is long, URL-safe and different every time", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => randomToken()));

    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[\w-]{43}$/);
  });
});

describe("sha256Hex", () => {
  it("hashes like everyone else", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("safeNext", () => {
  it.each([
    ["/alertas", "/alertas"],
    ["/alertas/nueva?ciclo=202620", "/alertas/nueva?ciclo=202620"],
    ["//evil.com", "/alertas"],
    ["/\\evil.com", "/alertas"],
    ["https://evil.com", "/alertas"],
    ["", "/alertas"],
    [null, "/alertas"],
  ])("%j → %j", (next, expected) => {
    expect(safeNext(next)).toBe(expected);
  });
});

describe("normalizeEmail", () => {
  it.each([
    ["  Ana@Example.COM ", "ana@example.com"],
    ["no-at-sign", null],
    ["a b@example.com", null],
    ["a@example", null],
  ])("%j → %j", (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
});
