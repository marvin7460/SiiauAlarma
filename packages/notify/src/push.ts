import type { NotificationPayload } from "@haycupo/core";
import {
  buildPushPayload,
  type PushSubscription,
  type VapidKeys,
} from "@block65/webcrypto-web-push";

import { cycleName } from "./format";
import type { AlertLinks } from "./links";

export interface StoredPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

/** What the service worker shows (see apps/web/public/sw.js). */
export interface PushNotificationData {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * Push services of the browsers people use (Chrome, Edge, Samsung, Opera and Brave use
 * Google's; Firefox uses Mozilla's; Safari uses Apple's; old Edge, Microsoft's). The server
 * POSTs to whatever endpoint a browser hands us, so anything else is refused: otherwise a
 * crafted "subscription" could make the server send requests to any other server.
 */
const PUSH_SERVICE_SUFFIXES = [
  ".googleapis.com",
  ".mozilla.com",
  ".push.apple.com",
  ".notify.windows.com",
];

export function isKnownPushService(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    PUSH_SERVICE_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
  );
}

export class PushError extends Error {
  override name = "PushError";

  constructor(
    message: string,
    readonly status: number,
    /** 404/410: the browser dropped the subscription; delete it. */
    readonly gone: boolean,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * Sends one Web Push message: encrypted (RFC 8291) and signed with VAPID (RFC 8292) using
 * WebCrypto, so it runs on Workers. A seat that opened ten minutes ago is old news, so the
 * push service may drop the message after 10 minutes (TTL).
 */
export async function sendPush(
  subscription: StoredPushSubscription,
  data: PushNotificationData,
  vapid: VapidConfig,
  doFetch: typeof fetch = fetch,
): Promise<void> {
  const target: PushSubscription = {
    endpoint: subscription.endpoint,
    expirationTime: null,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
  const keys: VapidKeys = vapid;
  const request = await buildPushPayload(
    { data: { ...data }, options: { ttl: 600, urgency: "high", topic: data.tag.slice(0, 32) } },
    target,
    keys,
  );
  let response: Response;
  try {
    response = await doFetch(subscription.endpoint, {
      ...request,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new PushError(`Push service unreachable: ${String(error)}`, 0, false, true);
  }
  if (!response.ok) {
    throw new PushError(
      `Push service answered ${String(response.status)}`,
      response.status,
      response.status === 404 || response.status === 410,
      response.status === 429 || response.status >= 500,
    );
  }
}

export function seatOpenedPush(
  payload: NotificationPayload,
  links: AlertLinks,
): PushNotificationData {
  const nrcs = payload.sections.map((section) => section.nrc).join(", ");
  return {
    title: `¡Hay cupo! ${payload.subject.code}`,
    body: `${payload.subject.name ?? payload.subject.code}: NRC ${nrcs}. Regístrate en SIIAU cuanto antes.`,
    url: links.siiau,
    tag: `cupo-${payload.alert.id}`,
  };
}

export function offerPublishedPush(
  payload: NotificationPayload,
  links: AlertLinks,
): PushNotificationData {
  return {
    title: `Ya publicaron ${payload.subject.code}`,
    body: `${payload.subject.name ?? payload.subject.code} para ${cycleName(payload.subject.cycle)}: ${String(payload.sections.length)} secciones.`,
    url: links.search,
    tag: `oferta-${payload.alert.id}`,
  };
}
