import { describeAlert } from "@haycupo/core";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { cancelAlertAction, signOutAction } from "@/app/actions";
import { ChannelsPanel } from "@/components/channels-panel";
import { listAlerts, type AlertListItem } from "@/lib/alerts";
import { getCurrentUser } from "@/lib/auth";
import { getChannelSettings } from "@/lib/channels";
import { searchHref } from "@/lib/subject-query";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Mis alertas" };

const STATUS_LABELS: Record<AlertListItem["status"], string> = {
  active: "Activa",
  expired: "Terminó el registro",
  cancelled: "Cancelada",
  fulfilled: "Cumplida",
};

const CHANNEL_LABELS: Record<AlertListItem["channels"][number], string> = {
  email: "correo",
  telegram: "Telegram",
  push: "notificación",
};

function AlertCard({ alert }: { alert: AlertListItem }) {
  const active = alert.status === "active";
  return (
    <li className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold">{describeAlert(alert)}</p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            active
              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
              : "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300"
          }`}
        >
          {STATUS_LABELS[alert.status]}
        </span>
      </div>
      <dl className="mt-2 grid gap-1 text-sm text-stone-600 sm:grid-cols-[10rem_1fr] dark:text-stone-400">
        <dt>Ciclo</dt>
        <dd>{alert.cycle}</dd>
        <dt>Avisos por</dt>
        <dd>{alert.channels.map((channel) => CHANNEL_LABELS[channel]).join(", ")}</dd>
        <dt>Avisos enviados</dt>
        <dd>
          {alert.notifyCount}
          {alert.lastNotifiedAt ? ` (último: ${formatDateTime(alert.lastNotifiedAt)})` : ""}
        </dd>
        {active ? (
          <>
            <dt>Última revisión</dt>
            <dd>
              {alert.lastSuccessAt ? formatDateTime(alert.lastSuccessAt) : "En unos minutos"}
              {alert.lastError ? " · SIIAU falló en el último intento; reintentamos" : ""}
            </dd>
            <dt>Se apaga</dt>
            <dd>{formatDateTime(alert.expiresAt)}</dd>
          </>
        ) : null}
      </dl>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <Link
          href={
            searchHref({
              cycle: alert.cycle,
              center: alert.center,
              value: alert.subjectCode,
            }) as "/buscar"
          }
          className="text-emerald-800 underline dark:text-emerald-300"
        >
          Ver secciones
        </Link>
        {active ? (
          <form action={cancelAlertAction}>
            <input type="hidden" name="alerta" value={alert.id} />
            <button type="submit" className="text-rose-700 underline dark:text-rose-300">
              Cancelar alerta
            </button>
          </form>
        ) : null}
      </div>
    </li>
  );
}

export default async function AlertsPage({ searchParams }: PageProps<"/alertas">) {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/alertas");
  const params = await searchParams;
  const [alerts, channels] = await Promise.all([listAlerts(user.id), getChannelSettings(user.id)]);
  const active = alerts.filter((alert) => alert.status === "active");
  const past = alerts.filter((alert) => alert.status !== "active");

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Mis alertas</h1>
        {params.creada ? (
          <p
            role="status"
            className="rounded-lg bg-emerald-50 p-3 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100"
          >
            Listo: te avisaremos en cuanto se libere un lugar.
          </p>
        ) : null}
        {params.actualizada ? (
          <p
            role="status"
            className="rounded-lg bg-emerald-50 p-3 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100"
          >
            Ya tenías esa alerta; la actualizamos.
          </p>
        ) : null}
      </div>

      <section aria-labelledby="activas" className="space-y-3">
        <h2 id="activas" className="text-lg font-semibold">
          Activas ({active.length})
        </h2>
        {active.length === 0 ? (
          <p className="text-stone-600 dark:text-stone-400">
            No tienes alertas activas.{" "}
            <Link href="/" className="text-emerald-800 underline dark:text-emerald-300">
              Busca una materia
            </Link>{" "}
            y pulsa «Avísame».
          </p>
        ) : (
          <ul className="space-y-3">
            {active.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <section aria-labelledby="anteriores" className="space-y-3">
          <h2 id="anteriores" className="text-lg font-semibold">
            Anteriores
          </h2>
          <ul className="space-y-3">
            {past.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </ul>
        </section>
      ) : null}

      <ChannelsPanel email={user.email} settings={channels} />

      <section
        aria-labelledby="cuenta"
        className="space-y-2 border-t border-stone-200 pt-6 dark:border-stone-800"
      >
        <h2 id="cuenta" className="text-lg font-semibold">
          Tu cuenta
        </h2>
        <p className="text-sm text-stone-700 dark:text-stone-300">Entraste como {user.email}.</p>
        <form action={signOutAction}>
          <button type="submit" className="text-sm text-stone-700 underline dark:text-stone-300">
            Salir
          </button>
        </form>
      </section>
    </div>
  );
}
