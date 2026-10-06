import { describeAlert } from "@haycupo/core";
import type { Metadata } from "next";
import Link from "next/link";

import { cancelSignedAlertAction } from "@/app/actions";
import { alertSummary } from "@/lib/alerts";

export const metadata: Metadata = { title: "Cancelar alerta", robots: { index: false } };

/**
 * Landing page of the "cancel this alert" link in emails. No sign-in needed (the link is
 * signed), but a button confirms it, so mail scanners that open links cancel nothing.
 */
export default async function CancelAlertPage({ searchParams }: PageProps<"/alertas/cancelar">) {
  const params = await searchParams;
  const done = params.listo === "1";
  const failed = params.error === "1";
  const alertId = typeof params.alerta === "string" ? params.alerta : "";
  const signature = typeof params.firma === "string" ? params.firma : "";
  const summary = !done && !failed && alertId ? await alertSummary(alertId) : null;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Cancelar alerta</h1>
      {done ? <p role="status">Listo, ya no te avisaremos de esta alerta.</p> : null}
      {failed || (!done && !summary) ? (
        <p role="alert">
          Este enlace no es válido. Puedes cancelar tus alertas desde «Mis alertas».
        </p>
      ) : null}
      {summary && summary.status !== "active" ? <p>Esta alerta ya no está activa.</p> : null}
      {summary && summary.status === "active" ? (
        <form action={cancelSignedAlertAction} className="space-y-4">
          <p>
            ¿Dejamos de avisarte de <strong>{describeAlert(summary)}</strong>?
          </p>
          <input type="hidden" name="alerta" value={alertId} />
          <input type="hidden" name="firma" value={signature} />
          <button
            type="submit"
            className="w-full rounded-lg bg-rose-700 px-4 py-2 font-semibold text-white hover:bg-rose-800"
          >
            Sí, cancelar
          </button>
        </form>
      ) : null}
      <p>
        <Link href="/alertas" className="text-emerald-800 underline dark:text-emerald-300">
          Ir a mis alertas
        </Link>
      </p>
    </div>
  );
}
