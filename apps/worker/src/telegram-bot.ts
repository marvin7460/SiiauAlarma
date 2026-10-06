import { alerts, telegramLinkTokens, users, watchedSubjects, type Database } from "@haycupo/db";
import { TELEGRAM_HELP, escapeTelegram, formatAlertList } from "@haycupo/notify";
import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";

/** The part of a Telegram Update we use. Anything else (edits, groups, stickers) is ignored. */
const UpdateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({
      chat: z.object({ id: z.number(), type: z.string() }),
      text: z.string().optional(),
    })
    .optional(),
});

/**
 * The answer, sent back in the webhook response: Telegram runs it as a Bot API call, so
 * replying costs no extra request from the Worker.
 */
export interface TelegramReply {
  method: "sendMessage";
  chat_id: number;
  text: string;
  parse_mode: "HTML";
  link_preview_options: { is_disabled: true };
}

export interface BotDeps {
  db: Database;
  appUrl: string;
  now?: () => Date;
}

/** Start codes are 43-character base64url tokens (Telegram allows A-Z a-z 0-9 _ -, max 64). */
const START_CODE = /^[\w-]{20,64}$/;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** "/start abc", "/alertas@HayCupoBot" → { command: "start", argument: "abc" }. */
export function parseCommand(text: string): { command: string; argument: string } | null {
  const match = /^\/([a-z_]+)(?:@\w+)?(?:\s+(.*))?$/is.exec(text.trim());
  if (!match?.[1]) return null;
  return { command: match[1].toLowerCase(), argument: (match[2] ?? "").trim() };
}

function reply(chatId: number, text: string): TelegramReply {
  return {
    method: "sendMessage",
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  };
}

async function linkChat(deps: BotDeps, chatId: number, code: string): Promise<string> {
  const at = deps.now?.() ?? new Date();
  const tokenHash = await sha256Hex(code);
  return deps.db.transaction(async (tx) => {
    // Single use: the code is deleted whether or not it is still valid.
    const [token] = await tx
      .delete(telegramLinkTokens)
      .where(eq(telegramLinkTokens.tokenHash, tokenHash))
      .returning();
    if (!token || token.expiresAt <= at) {
      return "Ese enlace ya no sirve (dura 15 minutos y se usa una sola vez). Genera otro en «Mis alertas» → «Conectar Telegram».";
    }
    // A chat belongs to one account: if it was linked to another one, move it.
    await tx
      .update(users)
      .set({ telegramChatId: null, telegramLinkedAt: null })
      .where(eq(users.telegramChatId, chatId));
    await tx
      .update(users)
      .set({ telegramChatId: chatId, telegramLinkedAt: at })
      .where(eq(users.id, token.userId));
    return [
      "✅ <b>¡Listo!</b> Tu cuenta quedó conectada.",
      "",
      "Te avisaré aquí en las alertas que tengan marcado Telegram. Puedes cambiarlo en la página, en «Mis alertas».",
      "",
      "/alertas — ver tus alertas activas",
    ].join("\n");
  });
}

async function listAlerts(deps: BotDeps, chatId: number): Promise<string> {
  const at = deps.now?.() ?? new Date();
  const [user] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.telegramChatId, chatId));
  if (!user) return notLinked();
  const rows = await deps.db
    .select({
      kind: alerts.kind,
      nrc: alerts.nrc,
      filters: alerts.filters,
      subjectCode: watchedSubjects.subjectCode,
      subjectName: watchedSubjects.subjectName,
      cycle: watchedSubjects.cycle,
    })
    .from(alerts)
    .innerJoin(watchedSubjects, eq(watchedSubjects.id, alerts.watchedSubjectId))
    .where(and(eq(alerts.userId, user.id), eq(alerts.status, "active"), gt(alerts.expiresAt, at)))
    .orderBy(asc(watchedSubjects.cycle), asc(alerts.createdAt));
  return [
    formatAlertList(rows),
    "",
    `<a href="${escapeTelegram(new URL("/alertas", deps.appUrl).href)}">Administrar mis alertas</a>`,
  ].join("\n");
}

async function unlink(deps: BotDeps, chatId: number): Promise<string> {
  const unlinked = await deps.db
    .update(users)
    .set({ telegramChatId: null, telegramLinkedAt: null })
    .where(eq(users.telegramChatId, chatId))
    .returning({ id: users.id });
  if (unlinked.length === 0) return notLinked();
  return [
    "Listo: ya no te enviaré avisos aquí.",
    "Tus alertas siguen activas y te avisan por los demás canales que tengan marcados.",
  ].join("\n");
}

function notLinked(): string {
  return "Este chat no está conectado a ninguna cuenta. Entra a la página, ve a «Mis alertas» y pulsa «Conectar Telegram».";
}

/**
 * Handles one webhook update. Only private chats: in a group, the alerts of one student
 * would be visible to everyone else.
 */
export async function handleTelegramUpdate(
  deps: BotDeps,
  body: unknown,
): Promise<TelegramReply | null> {
  const update = UpdateSchema.safeParse(body);
  const message = update.success ? update.data.message : undefined;
  if (message?.chat.type !== "private" || message.text === undefined) return null;
  const chatId = message.chat.id;
  const command = parseCommand(message.text);

  switch (command?.command) {
    case "start":
      if (START_CODE.test(command.argument)) {
        return reply(chatId, await linkChat(deps, chatId, command.argument));
      }
      return reply(chatId, TELEGRAM_HELP);
    case "alertas":
      return reply(chatId, await listAlerts(deps, chatId));
    case "desvincular":
      return reply(chatId, await unlink(deps, chatId));
    case "ayuda":
    case "help":
      return reply(chatId, TELEGRAM_HELP);
    default:
      return reply(chatId, "No entendí ese mensaje. Escribe /ayuda para ver lo que puedo hacer.");
  }
}
