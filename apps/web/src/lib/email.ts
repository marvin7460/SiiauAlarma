import "server-only";

import { createLogTransport, createResendTransport, type EmailTransport } from "@haycupo/notify";
import { createFileTransport } from "@haycupo/notify/file-transport";

import { serverEnv } from "./env";

let transport: EmailTransport | undefined;

/** Resend in production, JSON files in end-to-end tests, the console in development. */
export function emailTransport(): EmailTransport {
  if (transport) return transport;
  const env = serverEnv();
  switch (env.EMAIL_TRANSPORT) {
    case "resend":
      transport = createResendTransport({ apiKey: env.RESEND_API_KEY ?? "", from: env.EMAIL_FROM });
      break;
    case "file":
      transport = createFileTransport(env.EMAIL_FILE_DIR ?? ".emails");
      break;
    case "log":
      transport = createLogTransport();
      break;
  }
  return transport;
}
