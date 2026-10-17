import "server-only";

import { allow, fingerprint, type LimitName } from "@haycupo/engine";
import { headers } from "next/headers";

import { getDb } from "./db";
import { serverEnv } from "./env";

/**
 * The visitor's IP address. On Netlify, `x-nf-client-connection-ip` is set by Netlify's edge
 * from the TCP connection, so a visitor cannot fake it. Behind Caddy (the VM option), Caddy
 * replaces X-Forwarded-For with the real address. Never stored in clear (see `byIp`).
 */
export async function clientIp(): Promise<string> {
  const list = await headers();
  return (
    list.get("x-nf-client-connection-ip") ??
    list.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Counts a hit for the visitor's IP (as an HMAC); false when over the limit. */
export async function byIp(name: LimitName): Promise<boolean> {
  return allow(getDb(), name, await fingerprint(serverEnv().APP_SECRET, await clientIp()));
}

/** Counts a hit for an email address (as an HMAC). */
export async function byEmail(name: LimitName, email: string): Promise<boolean> {
  return allow(getDb(), name, await fingerprint(serverEnv().APP_SECRET, email));
}

/** Counts a hit for a signed-in student. */
export function byUser(name: LimitName, userId: string): Promise<boolean> {
  return allow(getDb(), name, userId);
}

/** Counts a hit shared by everyone. */
export function byEveryone(name: LimitName): Promise<boolean> {
  return allow(getDb(), name, "all");
}
