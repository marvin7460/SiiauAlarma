/** 32 random bytes, base64url: for session ids and magic-link tokens. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/**
 * SHA-256 in hex. We store only hashes of tokens: someone reading the database cannot use
 * them to sign in. (No salt needed: the tokens are random, not passwords.)
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Where to send someone after signing in. Only paths inside this site: "/alertas" is fine;
 * "//evil.com" or "https://evil.com" would be an open redirect.
 */
export function safeNext(next: string | null | undefined, fallback = "/alertas"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}

/** Lowercased and trimmed; null if it does not look like an email address. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
