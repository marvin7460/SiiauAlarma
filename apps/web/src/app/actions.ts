"use server";

import { WEEKDAYS } from "@haycupo/siiau";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { cancelAlertWithSignature, cancelOwnAlert, createAlert } from "@/lib/alerts";
import { getCurrentUser, requestMagicLink, signInWithToken, signOut } from "@/lib/auth";
import { safeNext } from "@/lib/tokens";

/** A text field from a form; files and missing fields become "". */
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export interface LoginState {
  status: "idle" | "sent" | "error";
  message?: string;
}

const LOGIN_ERRORS = {
  invalid_email: "Escribe un correo válido.",
  too_many_links:
    "Ya te enviamos varios enlaces. Revisa tu correo (y la carpeta de spam) o espera 15 minutos.",
  email_quota:
    "Hoy ya enviamos todos los correos que nuestro plan gratuito permite. Intenta mañana.",
  send_failed: "No pudimos enviar el correo. Intenta de nuevo en unos minutos.",
} as const;

export async function requestLoginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const result = await requestMagicLink(field(formData, "email"), field(formData, "next"));
  if (!result.ok) return { status: "error", message: LOGIN_ERRORS[result.error] };
  return { status: "sent", message: result.email };
}

/** The button on /entrar/confirmar. A POST, so link scanners in mail servers cannot sign in. */
export async function confirmLoginAction(formData: FormData): Promise<void> {
  const next = await signInWithToken(field(formData, "token"));
  redirect((next ?? "/entrar?error=enlace") as Route);
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/");
}

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .optional()
  .or(z.literal("").transform(() => undefined));

const AlertFormSchema = z.object({
  ciclo: z.string().regex(/^[0-9A-Z]{4,8}$/),
  centro: z.string().regex(/^[0-9A-Z]{1,2}$/),
  materia: z.string().regex(/^[A-Z0-9]{2,10}$/),
  tipo: z.enum(["section", "subject", "offer"]),
  nrc: z
    .string()
    .regex(/^\d{1,7}$/)
    .optional(),
  dias: z.array(z.enum(WEEKDAYS)).max(6),
  desde: time,
  hasta: time,
  profesor: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => value || undefined),
  canales: z.array(z.enum(["email", "telegram", "push"])).min(1),
});

const CREATE_ERRORS = {
  unknown_subject: "No encontramos esa materia en SIIAU. Búscala de nuevo.",
  unknown_section: "Ese NRC ya no aparece en SIIAU. Búscala de nuevo.",
  offer_published: "Esa oferta ya está publicada: elige una sección o cualquier sección.",
  too_many: "Ya tienes el máximo de alertas activas. Cancela alguna para crear otra.",
  invalid: "Revisa los datos de la alerta.",
} as const;

/** `/alertas/nueva?ciclo=…` + error=… (works whether or not the path has a query yet). */
function withError(path: string, message: string): string {
  const url = new URL(path, "http://local");
  url.searchParams.set("error", message);
  return `${url.pathname}${url.search}`;
}

export async function createAlertAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const backTo = safeNext(field(formData, "volver"), "/");
  if (!user) redirect(`/entrar?next=${encodeURIComponent(backTo)}` as Route);

  const parsed = AlertFormSchema.safeParse({
    ciclo: formData.get("ciclo"),
    centro: formData.get("centro"),
    materia: formData.get("materia"),
    tipo: formData.get("tipo"),
    nrc: formData.get("nrc") ?? undefined,
    dias: formData.getAll("dias"),
    desde: formData.get("desde") ?? undefined,
    hasta: formData.get("hasta") ?? undefined,
    profesor: formData.get("profesor") ?? undefined,
    canales: formData.getAll("canales"),
  });
  if (!parsed.success) redirect(withError(backTo, CREATE_ERRORS.invalid) as Route);
  const input = parsed.data;

  const result = await createAlert(user.id, {
    cycle: input.ciclo,
    center: input.centro,
    subjectCode: input.materia,
    kind: input.tipo,
    nrc: input.tipo === "section" ? (input.nrc ?? null) : null,
    filters: {
      ...(input.dias.length > 0 && input.dias.length < 6 ? { days: input.dias } : {}),
      ...(input.desde ? { startAfter: input.desde } : {}),
      ...(input.hasta ? { endBefore: input.hasta } : {}),
      ...(input.profesor ? { professor: input.profesor } : {}),
    },
    channels: input.canales,
  });
  if (!result.ok) redirect(withError(backTo, CREATE_ERRORS[result.error]) as Route);
  revalidatePath("/alertas");
  redirect(`/alertas?${result.existing ? "actualizada" : "creada"}=${result.alertId}` as Route);
}

export async function cancelAlertAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/alertas");
  await cancelOwnAlert(user.id, field(formData, "alerta"));
  revalidatePath("/alertas");
}

export async function cancelSignedAlertAction(formData: FormData): Promise<void> {
  const alertId = field(formData, "alerta");
  const ok = await cancelAlertWithSignature(alertId, field(formData, "firma"));
  redirect(ok ? "/alertas/cancelar?listo=1" : "/alertas/cancelar?error=1");
}
