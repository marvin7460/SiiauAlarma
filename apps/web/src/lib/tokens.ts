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

const SAME_SITE = "https://same.invalid";

/**
 * Where to send someone after signing in. Only paths inside this site: "/alertas" is fine;
 * "//evil.com" or "https://evil.com" would be an open redirect. Browsers drop tabs and line
 * breaks from URLs and read "\\" as "/", so "/\t/evil.com" would become "//evil.com": those are
 * refused too, and the result is whatever the browser would resolve against this site.
 */
export function safeNext(next: string | null | undefined, fallback = "/alertas"): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what we refuse
  if (!next || next.length > 512 || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) {
    return fallback;
  }
  const url = new URL(next, SAME_SITE);
  if (url.origin !== SAME_SITE) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Lowercased and trimmed; null if it does not look like an email address. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
