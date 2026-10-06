import type { Metadata } from "next";
import { connection } from "next/server";

import { getDb } from "@/lib/db";
import { getImpact, type DailyPoint } from "@/lib/impact";

export const metadata: Metadata = {
  title: "Impacto",
  description: "Cuántas búsquedas, alertas y lugares encontrados lleva ¿Hay Cupo?.",
};

const number = new Intl.NumberFormat("es-MX");

function formatWait(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${String(rounded)} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}

function Stat(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <dt className="text-sm text-stone-600 dark:text-stone-400">{props.label}</dt>
      <dd className="mt-1 text-3xl font-bold tracking-tight">{props.value}</dd>
      {props.hint ? (
        <dd className="mt-1 text-xs text-stone-600 dark:text-stone-400">{props.hint}</dd>
      ) : null}
    </div>
  );
}

const shortDay = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** Bars of seats found per day. A table underneath carries the same data for screen readers. */
function DailyChart({ points }: { points: DailyPoint[] }) {
  const highest = Math.max(1, ...points.map((point) => point.seatsOpened));
  const label = (point: DailyPoint) => shortDay.format(new Date(`${point.day}T12:00:00Z`));
  return (
    <figure className="space-y-2">
      <div
        aria-hidden="true"
        className="flex h-40 items-end gap-0.5 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900"
      >
        {points.map((point) => (
          <div
            key={point.day}
            title={`${label(point)}: ${String(point.seatsOpened)} lugares`}
            className="flex-1 rounded-t bg-emerald-600 dark:bg-emerald-500"
            style={{ height: `${String(Math.max(2, (point.seatsOpened / highest) * 100))}%` }}
          />
        ))}
      </div>
      <figcaption className="flex justify-between text-xs text-stone-600 dark:text-stone-400">
        <span>{points[0] ? label(points[0]) : ""}</span>
        <span>Lugares que se liberaron por día (últimos {points.length} días)</span>
        <span>{points.at(-1) ? label(points.at(-1) as DailyPoint) : ""}</span>
      </figcaption>
      <table className="sr-only">
        <caption>Lugares liberados y avisos enviados por día</caption>
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col">Lugares</th>
            <th scope="col">Avisos</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <th scope="row">{label(point)}</th>
              <td>{point.seatsOpened}</td>
              <td>{point.notifications}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default async function ImpactPage() {
  await connection();
  const impact = await getImpact(getDb());
  const { totals, now } = impact;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Impacto</h1>
        <p className="text-stone-700 dark:text-stone-300">
          Lo que ¿Hay Cupo? ha hecho desde que empezó. Son conteos diarios: no usamos cookies ni
          rastreadores y no sabemos quién visita la página.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <Stat
          label="Lugares que se liberaron"
          value={number.format(totals.seatsOpened)}
          hint="Secciones que pasaron de 0 a 1 o más lugares mientras alguien esperaba."
        />
        <Stat
          label="Tiempo promedio hasta encontrar lugar"
          value={
            impact.averageMinutesToSeat === null ? "—" : formatWait(impact.averageMinutesToSeat)
          }
          hint="Desde que alguien pide el aviso hasta el primer «¡Hay cupo!» (últimos 6 meses)."
        />
        <Stat label="Alertas creadas" value={number.format(totals.alertsCreated)} />
        <Stat
          label="Mensajes enviados"
          value={number.format(totals.notifications)}
          hint="Correos, mensajes de Telegram y notificaciones."
        />
        <Stat label="Búsquedas" value={number.format(totals.searches)} />
        <Stat
          label="Ahora mismo"
          value={`${number.format(now.activeAlerts)} alertas`}
          hint={`En ${number.format(now.watchedSubjects)} materias, de ${number.format(now.accounts)} estudiantes.`}
        />
      </dl>

      <DailyChart points={impact.lastDays} />
    </div>
  );
}
