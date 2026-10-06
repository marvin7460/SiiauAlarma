import type { NotificationPayload } from "@haycupo/core";
import type { Section } from "@haycupo/siiau";
import { describe, expect, it, vi } from "vitest";

import { magicLinkEmail, offerPublishedEmail, seatOpenedEmail } from "./email/templates";
import { EmailSendError, createResendTransport } from "./email/transport";
import { cycleName, escapeHtml } from "./format";
import { buildAlertLinks, signAlertCancel, verifyAlertCancel } from "./links";

const SECTION: Section = {
  nrc: "78088",
  subjectCode: "I5890",
  subjectName: "BASES DE DATOS",
  section: "D02",
  credits: 8,
  capacity: 23,
  available: 1,
  sessions: [
    {
      number: "01",
      start: "13:00",
      end: "14:55",
      days: ["LU", "JU"],
      building: "DUCT1",
      room: "LC03",
      startDate: "2026-08-17",
      endDate: "2026-12-11",
    },
  ],
  professors: [{ session: "01", name: "MUÑOZ EJEMPLO, ANA" }],
};

const PAYLOAD: NotificationPayload = {
  reason: "seat_opened",
  subject: { cycle: "202710", center: "D", code: "I5890", name: "BASES DE DATOS" },
  alert: { id: "alert-1", kind: "section", nrc: "78088", filters: {} },
  sections: [SECTION],
  detectedAt: "2027-01-11T19:05:00Z",
};

const links = () =>
  buildAlertLinks({
    appUrl: "https://haycupo.example",
    secret: "s".repeat(32),
    alertId: "alert-1",
    subject: PAYLOAD.subject,
  });

describe("signed cancel links", () => {
  it("verifies its own signatures and rejects others", async () => {
    const signature = await signAlertCancel("secret-1", "alert-1");

    expect(await verifyAlertCancel("secret-1", "alert-1", signature)).toBe(true);
    expect(await verifyAlertCancel("secret-1", "alert-2", signature)).toBe(false);
    expect(await verifyAlertCancel("secret-2", "alert-1", signature)).toBe(false);
    expect(await verifyAlertCancel("secret-1", "alert-1", `${signature}x`)).toBe(false);
  });

  it("builds every link of an alert email", async () => {
    const built = await links();

    expect(built.cancelPage).toMatch(
      /^https:\/\/haycupo\.example\/alertas\/cancelar\?alerta=alert-1&firma=/,
    );
    expect(built.cancelOneClick).toMatch(/\/api\/alertas\/cancelar\?/);
    expect(built.siiau).toBe(
      "https://siiauescolar.siiau.udg.mx/wal/sspseca.consulta_oferta?ciclop=202710&cup=D&crsep=I5890&mostrarp=500",
    );
    expect(built.search).toBe("https://haycupo.example/buscar?ciclo=202710&centro=D&materia=I5890");
  });
});

describe("seatOpenedEmail", () => {
  it("names the subject, NRC, schedule and time in Guadalajara", async () => {
    const email = seatOpenedEmail(PAYLOAD, await links());

    expect(email.subject).toBe("¡Hay cupo! I5890 BASES DE DATOS · NRC 78088");
    expect(email.text).toContain("A las 13:05 (hora de Guadalajara)");
    expect(email.text).toContain("NRC 78088 · Sección D02 · 1 de 23 lugares libres");
    expect(email.text).toContain("lunes y jueves, 13:00–14:55 · DUCT1 LC03");
    expect(email.text).toContain("ciclo 2027A");
    expect(email.html).toContain("MUÑOZ EJEMPLO, ANA");
    expect(email.text).toContain("Cancelar esta alerta: https://haycupo.example/alertas/cancelar?");
    expect(email.text).toContain("no afiliado a la Universidad de Guadalajara");
  });

  it("summarizes several sections in the subject line", async () => {
    const email = seatOpenedEmail(
      { ...PAYLOAD, sections: [SECTION, { ...SECTION, nrc: "78090" }] },
      await links(),
    );

    expect(email.subject).toBe("¡Hay cupo! I5890 BASES DE DATOS · 2 secciones");
  });

  it("escapes HTML coming from SIIAU", async () => {
    const hostile = { ...SECTION, professors: [{ session: "01", name: "<script>x</script>" }] };
    const email = seatOpenedEmail({ ...PAYLOAD, sections: [hostile] }, await links());

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

describe("offerPublishedEmail", () => {
  it("says how many sections were published and links to our search", async () => {
    const email = offerPublishedEmail(
      {
        ...PAYLOAD,
        reason: "offer_published",
        alert: { ...PAYLOAD.alert, kind: "offer", nrc: null },
        sections: [SECTION, { ...SECTION, nrc: "78090", available: 0 }],
      },
      await links(),
    );

    expect(email.subject).toBe("Ya publicaron I5890 BASES DE DATOS para 2027A");
    expect(email.text).toContain(
      "2 secciones de I5890 BASES DE DATOS para 2027A; 1 con lugares libres",
    );
    expect(email.text).toContain("https://haycupo.example/buscar?ciclo=202710");
  });
});

describe("magicLinkEmail", () => {
  it("contains the link and says when it expires", () => {
    const email = magicLinkEmail("https://haycupo.example/entrar/confirmar?token=abc");

    expect(email.text).toContain("https://haycupo.example/entrar/confirmar?token=abc");
    expect(email.text).toContain("15 minutos");
    expect(email.html).toContain('href="https://haycupo.example/entrar/confirmar?token=abc"');
  });
});

describe("createResendTransport", () => {
  const message = { to: "a@example.com", subject: "s", html: "<p>h</p>", text: "t" };

  it("posts the message to Resend with the API key", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ id: "re_123" })));
    const transport = createResendTransport({
      apiKey: "re_key",
      from: "Avisos <a@b.c>",
      fetch: fetchMock,
    });

    expect(await transport.send(message)).toEqual({ id: "re_123" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer re_key");
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: "Avisos <a@b.c>",
      to: ["a@example.com"],
    });
  });

  it.each([
    [429, true],
    [503, true],
    [422, false],
  ])("marks HTTP %i as retryable=%s", async (status, retryable) => {
    const transport = createResendTransport({
      apiKey: "k",
      from: "f",
      fetch: () => Promise.resolve(Response.json({ message: "nope" }, { status })),
    });

    const error = await transport.send(message).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ retryable });
  });
});

describe("format helpers", () => {
  it("names cycles and escapes HTML", () => {
    expect(cycleName("202710")).toBe("2027A");
    expect(cycleName("202620")).toBe("2026B");
    expect(cycleName("2026C")).toBe("2026C");
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});
