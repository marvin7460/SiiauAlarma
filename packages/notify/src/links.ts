import { buildOfferUrl } from "@haycupo/siiau";

const encoder = new TextEncoder();

function base64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/**
 * Signature for "cancel this alert" links in emails, so a student can stop an alert without
 * signing in, and nobody can cancel someone else's alert by guessing ids. Nothing is stored:
 * the worker signs, the web verifies, both with APP_SECRET.
 */
export function signAlertCancel(secret: string, alertId: string): Promise<string> {
  return hmac(secret, `cancel-alert:${alertId}`);
}

export async function verifyAlertCancel(
  secret: string,
  alertId: string,
  signature: string,
): Promise<boolean> {
  const expected = await signAlertCancel(secret, alertId);
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return difference === 0;
}

export interface AlertLinks {
  /** Page that asks for confirmation before cancelling (safe from link scanners). */
  cancelPage: string;
  /** RFC 8058 one-click endpoint for the List-Unsubscribe header. */
  cancelOneClick: string;
  myAlerts: string;
  /** SIIAU's public query for the subject, to check before registering. */
  siiau: string;
  /** Our search page for the subject. */
  search: string;
}

export async function buildAlertLinks(input: {
  appUrl: string;
  secret: string;
  alertId: string;
  subject: { cycle: string; center: string; code: string };
}): Promise<AlertLinks> {
  const signature = await signAlertCancel(input.secret, input.alertId);
  const params = new URLSearchParams({ alerta: input.alertId, firma: signature });
  const search = new URLSearchParams({
    ciclo: input.subject.cycle,
    centro: input.subject.center,
    materia: input.subject.code,
  });
  return {
    cancelPage: new URL(`/alertas/cancelar?${params.toString()}`, input.appUrl).href,
    cancelOneClick: new URL(`/api/alertas/cancelar?${params.toString()}`, input.appUrl).href,
    myAlerts: new URL("/alertas", input.appUrl).href,
    siiau: buildOfferUrl({
      cycle: input.subject.cycle,
      center: input.subject.center,
      subjectCode: input.subject.code,
    }).href,
    search: new URL(`/buscar?${search.toString()}`, input.appUrl).href,
  };
}
