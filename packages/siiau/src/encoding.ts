const CHARSET = /charset\s*=\s*"?([\w-]+)"?/i;

/**
 * windows-1252 differs from ISO-8859-1 only in bytes 0x80–0x9F. Unassigned bytes map to the
 * same code point, as the WHATWG Encoding Standard says.
 */
// prettier-ignore
const WINDOWS_1252_80_9F = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

function hasC1Bytes(bytes: Uint8Array): boolean {
  for (const byte of bytes) if (byte >= 0x80 && byte <= 0x9f) return true;
  return false;
}

function decodeWindows1252(bytes: Uint8Array): string {
  // Fast path: without bytes 0x80–0x9F, every runtime's latin1 decoder gives the same result.
  if (!hasC1Bytes(bytes)) return new TextDecoder("latin1").decode(bytes);
  const parts: string[] = [];
  for (const byte of bytes) {
    const code = byte >= 0x80 && byte <= 0x9f ? (WINDOWS_1252_80_9F[byte - 0x80] ?? byte) : byte;
    parts.push(String.fromCharCode(code));
  }
  return parts.join("");
}

/**
 * Decodes a SIIAU response body. SIIAU serves ISO-8859-1; like browsers, we decode that label
 * as windows-1252, its superset. If the server ever declares UTF-8, we honor it.
 *
 * The 0x80–0x9F table is ours on purpose: Node's TextDecoder treats "windows-1252" as plain
 * ISO-8859-1, so those bytes would decode differently in tests (Node) and in Workers.
 */
export function decodeSiiauBody(bytes: Uint8Array, contentType: string | null = null): string {
  const charset = contentType ? CHARSET.exec(contentType)?.[1]?.toLowerCase() : undefined;
  if (charset === "utf-8" || charset === "utf8") return new TextDecoder("utf-8").decode(bytes);
  return decodeWindows1252(bytes);
}
