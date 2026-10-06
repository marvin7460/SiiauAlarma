import { describeAlert, type NotificationPayload } from "@haycupo/core";
import { formatProfessorName, formatSession, type Section } from "@haycupo/siiau";

import { clockTime, cycleName, escapeHtml } from "../format";
import type { AlertLinks } from "../links";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const DISCLAIMER =
  "¿Hay Cupo? es un proyecto independiente de un estudiante, no afiliado a la Universidad de Guadalajara.";

function layout(title: string, body: string, footer: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#f5f5f4;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1c1917">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;font-weight:700;font-size:18px">¿Hay <span style="color:#047857">Cupo</span>?</p>
${body}
</div>
<div style="max-width:560px;margin:16px auto 0;font-size:12px;color:#57534e;line-height:1.5">${footer}</div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${escapeHtml(label)}</a></p>`;
}

function sectionLines(section: Section): string[] {
  const professors = section.professors.map((p) => formatProfessorName(p.name)).join("; ");
  return [
    `NRC ${section.nrc} · Sección ${section.section} · ${String(section.available)} de ${String(section.capacity)} lugares libres`,
    ...section.sessions.map((session) => formatSession(session)),
    professors ? `Profesor: ${professors}` : "Sin profesor asignado",
  ];
}

function sectionHtml(section: Section): string {
  const [first = "", ...rest] = sectionLines(section);
  return `<div style="border:1px solid #e7e5e4;border-radius:8px;padding:12px;margin:12px 0">
<p style="margin:0;font-weight:600">${escapeHtml(first)}</p>
${rest.map((line) => `<p style="margin:4px 0 0;font-size:14px;color:#44403c">${escapeHtml(line)}</p>`).join("\n")}
</div>`;
}

function subjectTitle(payload: NotificationPayload): string {
  const { code, name } = payload.subject;
  return name ? `${code} ${name}` : code;
}

function alertFooter(
  payload: NotificationPayload,
  links: AlertLinks,
): { html: string; text: string } {
  const description = describeAlert({
    kind: payload.alert.kind,
    nrc: payload.alert.nrc,
    subjectCode: payload.subject.code,
    subjectName: payload.subject.name,
    filters: payload.alert.filters,
  });
  return {
    html: `<p style="margin:0 0 8px">Recibiste este correo porque pediste un aviso: ${escapeHtml(description)}.</p>
<p style="margin:0 0 8px"><a href="${escapeHtml(links.cancelPage)}" style="color:#57534e">Cancelar esta alerta</a> · <a href="${escapeHtml(links.myAlerts)}" style="color:#57534e">Ver mis alertas</a></p>
<p style="margin:0">${escapeHtml(DISCLAIMER)}</p>`,
    text: `Recibiste este correo porque pediste un aviso: ${description}.
Cancelar esta alerta: ${links.cancelPage}
Ver mis alertas: ${links.myAlerts}

${DISCLAIMER}`,
  };
}

/** "¡Hay cupo!" — one or more sections an alert was waiting for now have free seats. */
export function seatOpenedEmail(payload: NotificationPayload, links: AlertLinks): RenderedEmail {
  const title = subjectTitle(payload);
  const [only] = payload.sections;
  const subject =
    payload.sections.length === 1 && only
      ? `¡Hay cupo! ${title} · NRC ${only.nrc}`
      : `¡Hay cupo! ${title} · ${String(payload.sections.length)} secciones`;
  const detected = clockTime(new Date(payload.detectedAt));
  const intro = `A las ${detected} (hora de Guadalajara) se liberó un lugar en ${title}, ciclo ${cycleName(payload.subject.cycle)}.`;
  const advice = "Los lugares se ocupan rápido: regístrate en SIIAU cuanto antes.";
  const footer = alertFooter(payload, links);

  const html = layout(
    subject,
    `<h1 style="margin:0 0 8px;font-size:22px">Se liberó un lugar</h1>
<p style="margin:0">${escapeHtml(intro)}</p>
${payload.sections.map(sectionHtml).join("\n")}
<p style="margin:16px 0 0">${escapeHtml(advice)}</p>
${button(links.siiau, "Ver la materia en SIIAU")}`,
    footer.html,
  );
  const text = [
    "Se liberó un lugar",
    "",
    intro,
    "",
    ...payload.sections.flatMap((section) => [...sectionLines(section), ""]),
    advice,
    `Ver la materia en SIIAU: ${links.siiau}`,
    "",
    footer.text,
  ].join("\n");
  return { subject, html, text };
}

/** The subject had no sections in this cycle and now it does. */
export function offerPublishedEmail(
  payload: NotificationPayload,
  links: AlertLinks,
): RenderedEmail {
  const title = subjectTitle(payload);
  const cycle = cycleName(payload.subject.cycle);
  const withSeats = payload.sections.filter((section) => section.available > 0).length;
  const subject = `Ya publicaron ${title} para ${cycle}`;
  const intro = `SIIAU ya muestra ${String(payload.sections.length)} ${
    payload.sections.length === 1 ? "sección" : "secciones"
  } de ${title} para ${cycle}; ${String(withSeats)} con lugares libres.`;
  const next = "Puedes ver horarios y profesores, y pedir un aviso para la sección que te acomode.";
  const footer = alertFooter(payload, links);

  const html = layout(
    subject,
    `<h1 style="margin:0 0 8px;font-size:22px">Ya está la oferta</h1>
<p style="margin:0">${escapeHtml(intro)}</p>
<p style="margin:12px 0 0">${escapeHtml(next)}</p>
${button(links.search, "Ver secciones")}`,
    footer.html,
  );
  const text = [
    "Ya está la oferta",
    "",
    intro,
    next,
    `Ver secciones: ${links.search}`,
    "",
    footer.text,
  ].join("\n");
  return { subject, html, text };
}

/** The magic link to sign in. */
export function magicLinkEmail(url: string): RenderedEmail {
  const subject = "Tu enlace para entrar a ¿Hay Cupo?";
  const html = layout(
    subject,
    `<h1 style="margin:0 0 8px;font-size:22px">Entra a ¿Hay Cupo?</h1>
<p style="margin:0">Usa este botón para entrar. Vence en 15 minutos y solo funciona una vez.</p>
${button(url, "Entrar")}
<p style="margin:0;font-size:14px;color:#57534e">Si no lo pediste, ignora este correo: sin el enlace nadie puede entrar.</p>`,
    escapeHtml(DISCLAIMER),
  );
  const text = `Entra a ¿Hay Cupo?

Abre este enlace para entrar (vence en 15 minutos y solo funciona una vez):
${url}

Si no lo pediste, ignora este correo: sin el enlace nadie puede entrar.

${DISCLAIMER}`;
  return { subject, html, text };
}
