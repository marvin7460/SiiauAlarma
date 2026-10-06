export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<{ id: string | null }>;
}

export class EmailSendError extends Error {
  override name = "EmailSendError";

  constructor(
    message: string,
    /** Worth retrying later (rate limit, provider down), as opposed to a bad request. */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). Plain `fetch`,
 * so it runs on Cloudflare Workers and on Node alike.
 */
export function createResendTransport(options: {
  apiKey: string;
  from: string;
  fetch?: typeof fetch;
}): EmailTransport {
  const doFetch = options.fetch ?? fetch;
  return {
    async send(message) {
      let response: Response;
      try {
        response = await doFetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: options.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            headers: message.headers,
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        throw new EmailSendError(`Resend unreachable: ${String(error)}`, true);
      }
      const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new EmailSendError(
          `Resend answered ${String(response.status)}: ${body.message ?? "unknown error"}`,
          retryable,
        );
      }
      return { id: body.id ?? null };
    },
  };
}

/** Keeps messages in memory. For tests. */
export function createMemoryTransport(): EmailTransport & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    send(message) {
      sent.push(message);
      return Promise.resolve({ id: `memory-${String(sent.length)}` });
    },
  };
}

/** Prints messages instead of sending them. For local development without an API key. */
export function createLogTransport(log: (line: string) => void = console.log): EmailTransport {
  return {
    send(message) {
      log(`[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
      return Promise.resolve({ id: null });
    },
  };
}
