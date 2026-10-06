import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { getSystemStatus, type Overall, type SystemStatus } from "@/lib/status";
import { formatDateTime, formatRelativeTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Estado",
  description: "Si ¿Hay Cupo? está revisando SIIAU y enviando avisos ahora mismo.",
};

const BANNERS: Record<Overall, { title: string; className: string }> = {
  ok: {
    title: "Todo funciona",
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  },
  degraded: {
    title: "Funciona con problemas",
    className:
      "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  },
  paused: {
    title: "En pausa",
    className:
      "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
  },
  down: {
    title: "Sin servicio",
    className:
      "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100",
  },
};

function when(date: Date | null, now: Date): string {
  return date ? formatRelativeTime(date, now) : "todavía no";
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <h2 className="font-semibold">{props.title}</h2>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[14rem_1fr]">
        {props.children}
      </dl>
    </section>
  );
}

function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-stone-600 dark:text-stone-400">{props.label}</dt>
      <dd>{props.children}</dd>
    </>
  );
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "sin datos";
  return ms < 1000 ? `${String(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function siiauState(status: SystemStatus): string {
  if (status.worker && !status.worker.siiauEnabled) return "Apagadas";
  if (status.gateway.pausedUntil) {
    return `En pausa hasta ${formatDateTime(status.gateway.pausedUntil)}`;
  }
  return "Activas";
}

export default async function StatusPage() {
  await connection();
  const status = await getSystemStatus();
  const now = status.checkedAt;
  const banner = BANNERS[status.overall];
  const { sentLastDay } = status.notifications;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Estado del servicio</h1>

      <div role="status" className={`rounded-xl border p-4 ${banner.className}`}>
        <p className="text-lg font-semibold">{banner.title}</p>
        {status.reasons.length > 0 ? (
          <ul className="mt-1 list-disc pl-5 text-sm">
            {status.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm">
            Revisamos SIIAU con normalidad y los avisos salen en cuanto hay lugar.
          </p>
        )}
      </div>

      <Card title="Consultas a SIIAU">
        <Row label="Consultas">{siiauState(status)}</Row>
        <Row label="Última consulta exitosa">{when(status.requests.lastOkAt, now)}</Row>
        <Row label="En la última hora">{status.requests.lastHour}</Row>
        <Row label="En las últimas 24 horas">
          {status.requests.lastDay}
          {status.requests.failedLastDay > 0
            ? ` (${String(status.requests.failedLastDay)} fallaron)`
            : ""}
        </Row>
        <Row label="Respuesta promedio de SIIAU">{formatDuration(status.requests.averageMs)}</Row>
        <Row label="robots.txt leído">
          {status.gateway.robotsFetchedAt
            ? `${when(status.gateway.robotsFetchedAt, now)} (HTTP ${String(status.gateway.robotsStatus ?? "?")})`
            : "todavía no"}
        </Row>
      </Card>

      <Card title="Revisiones de materias">
        <Row label="Última revisión programada">{when(status.poller.lastRunStartedAt, now)}</Row>
        <Row label="Materias vigiladas">{status.subjects.watched}</Row>
        <Row label="Retrasadas">{status.subjects.late}</Row>
        <Row label="Con errores recientes">{status.subjects.failing}</Row>
      </Card>

      <Card title="Avisos (últimas 24 horas)">
        <Row label="Por correo">{sentLastDay.email}</Row>
        <Row label="Por Telegram">{sentLastDay.telegram}</Row>
        <Row label="Notificaciones">{sentLastDay.push}</Row>
        <Row label="En cola">{status.notifications.pending}</Row>
        <Row label="No se pudieron entregar">{status.notifications.failedLastDay}</Row>
        <Row label="Correos de hoy (límite gratuito)">
          {status.email.sentToday} de {status.email.limit}
        </Row>
      </Card>

      <p className="text-sm text-stone-600 dark:text-stone-400">
        Datos al {formatDateTime(now)}. Recarga la página para actualizarlos. Cómo cuidamos a SIIAU:{" "}
        <Link href="/acerca#uso-responsable" className="underline">
          uso responsable
        </Link>
        .
      </p>
    </div>
  );
}
