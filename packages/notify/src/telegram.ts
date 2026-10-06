import { describeAlert, type NotificationPayload } from "@haycupo/core";
import { formatSession } from "@haycupo/siiau";

import { clockTime, cycleName } from "./format";
import type { AlertLinks } from "./links";

/** Telegram's HTML parse mode only needs these three escaped. */
export function escapeTelegram(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export class TelegramError extends Error {
  override name = "TelegramError";

  constructor(
    message: string,
    readonly status: number,
    /** The student blocked the bot or deleted the chat: stop sending there. */
    readonly chatGone: boolean,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface TelegramClient {
  sendMessage(chatId: number, html: string): Promise<void>;
  /** Raw Bot API call, for setup scripts. */
  call(method: string, body: Record<string, unknown>): Promise<unknown>;
}

/** Telegram Bot API over plain `fetch` (works on Workers and Node). */
export function createTelegramClient(options: {
  token: string;
  fetch?: typeof fetch;
  /** Only for end-to-end tests, which point it at a fake Bot API. */
  apiOrigin?: string;
}): TelegramClient {
  const doFetch = options.fetch ?? fetch;
  const origin = options.apiOrigin ?? "https://api.telegram.org";
  const call = async (method: string, body: Record<string, unknown>) => {
    let response: Response;
    try {
      response = await doFetch(`${origin}/bot${options.token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new TelegramError(`Telegram unreachable: ${String(error)}`, 0, false, true);
    }
    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: unknown;
    };
    if (!response.ok || !result.ok) {
      const description = result.description ?? `HTTP ${String(response.status)}`;
      throw new TelegramError(
        `Telegram ${method} failed: ${description}`,
        response.status,
        response.status === 403 || /chat not found/i.test(description),
        response.status === 429 || response.status >= 500,
      );
    }
    return result.result;
  };
  return {
    call,
    async sendMessage(chatId, html) {
      await call("sendMessage", {
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    },
  };
}

function title(payload: NotificationPayload): string {
  const { code, name } = payload.subject;
  return name ? `${code} ${name}` : code;
}

/** "¡Hay cupo!" for Telegram: short, with the NRC first so it can be copied quickly. */
export function seatOpenedTelegram(payload: NotificationPayload, links: AlertLinks): string {
  const sections = payload.sections
    .map((section) => {
      const sessions = section.sessions.map((session) => escapeTelegram(formatSession(session)));
      return [
        `<b>NRC <code>${escapeTelegram(section.nrc)}</code></b> · Sección ${escapeTelegram(section.section)} · ${String(section.available)} de ${String(section.capacity)} libres`,
        ...sessions,
      ].join("\n");
    })
    .join("\n\n");
  return [
    `🔔 <b>¡Hay cupo! ${escapeTelegram(title(payload))}</b>`,
    `Ciclo ${cycleName(payload.subject.cycle)} · detectado a las ${clockTime(new Date(payload.detectedAt))}`,
    "",
    sections,
    "",
    `Regístrate en SIIAU cuanto antes: <a href="${escapeTelegram(links.siiau)}">ver la materia</a>`,
    `<a href="${escapeTelegram(links.cancelPage)}">Cancelar esta alerta</a>`,
  ].join("\n");
}

export function offerPublishedTelegram(payload: NotificationPayload, links: AlertLinks): string {
  const withSeats = payload.sections.filter((section) => section.available > 0).length;
  return [
    `📚 <b>Ya publicaron ${escapeTelegram(title(payload))}</b> para ${cycleName(payload.subject.cycle)}`,
    `${String(payload.sections.length)} secciones, ${String(withSeats)} con lugares libres.`,
    `<a href="${escapeTelegram(links.search)}">Ver secciones y pedir un aviso</a>`,
  ].join("\n");
}

export interface TelegramAlertLine {
  kind: NotificationPayload["alert"]["kind"];
  nrc: string | null;
  subjectCode: string;
  subjectName: string | null;
  filters: NotificationPayload["alert"]["filters"];
  cycle: string;
}

/**
 * Reply to /alertas: the student's active alerts, one per line.
 *
 * TODO(Marvin): make this list nicer. Today it is a numbered list of `describeAlert(...)`.
 * Ideas (and the tests in telegram.test.ts, `.skip`ped, describe the expected result):
 * - Group the alerts by cycle, with the cycle as a bold header: "<b>2027A</b>".
 * - Put the NRC of section alerts in <code>…</code> so it can be copied with one tap.
 * - Remember to escape with `escapeTelegram` everything that comes from data.
 * Hint: `cycleName("202710")` gives "2027A"; build a Map from cycle to lines.
 */
export function formatAlertList(alerts: readonly TelegramAlertLine[]): string {
  if (alerts.length === 0) return "No tienes alertas activas.";
  return alerts
    .map(
      (alert, index) =>
        `${String(index + 1)}. ${escapeTelegram(
          describeAlert({
            kind: alert.kind,
            nrc: alert.nrc,
            subjectCode: alert.subjectCode,
            subjectName: alert.subjectName,
            filters: alert.filters,
          }),
        )}`,
    )
    .join("\n");
}

export const TELEGRAM_HELP = [
  "Soy el bot de <b>¿Hay Cupo?</b>: te aviso cuando se libera un lugar en las materias que vigilas.",
  "",
  "Para conectarme con tu cuenta, entra a la página, ve a «Mis alertas» y pulsa «Conectar Telegram».",
  "",
  "/alertas — tus alertas activas",
  "/desvincular — dejar de recibir avisos aquí",
  "/ayuda — este mensaje",
  "",
  "Proyecto independiente, no afiliado a la Universidad de Guadalajara. Nunca te pediré tu contraseña de SIIAU.",
].join("\n");
