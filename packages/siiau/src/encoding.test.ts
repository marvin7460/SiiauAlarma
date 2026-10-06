import { describe, expect, it } from "vitest";

import { decodeSiiauBody } from "./encoding";

// "MUÑOZ PEÑA" in ISO-8859-1: Ñ is the single byte 0xD1.
const LATIN1_BYTES = new Uint8Array([0x4d, 0x55, 0xd1, 0x4f, 0x5a, 0x20, 0x50, 0x45, 0xd1, 0x41]);

describe("decodeSiiauBody", () => {
  it("decodes ISO-8859-1 by default, keeping Ñ", () => {
    expect(decodeSiiauBody(LATIN1_BYTES)).toBe("MUÑOZ PEÑA");
  });

  it("treats ISO-8859-1 as windows-1252, like browsers do", () => {
    // 0x93/0x94 are curly quotes in windows-1252 (C1 control codes in strict ISO-8859-1).
    const bytes = new Uint8Array([0x93, 0x41, 0x94]);

    expect(decodeSiiauBody(bytes, "text/html; charset=ISO-8859-1")).toBe("“A”");
  });

  it("honors a UTF-8 charset if SIIAU ever switches", () => {
    const bytes = new TextEncoder().encode("MUÑOZ");

    expect(decodeSiiauBody(bytes, 'text/html; charset="UTF-8"')).toBe("MUÑOZ");
  });
});
