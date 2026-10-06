import { bumpMetric } from "@haycupo/db";
import { buildOfferUrl, type Section } from "@haycupo/siiau";
import type { SearchResponse } from "@haycupo/engine/contract";
import { after } from "next/server";

import { getDb } from "@/lib/db";
import type { SubjectQuery } from "@/lib/subject-query";
import { formatDateTime, formatRelativeTime } from "@/lib/time";
import { SearchError, searchOffer } from "@/lib/siiau";

import { Problem } from "./problem";
import { SectionCard } from "./section-card";

/** Link to /alertas/nueva for a subject (and optionally one section). */
function alertHref(
  query: SubjectQuery,
  code: string,
  kind: "section" | "subject" | "offer",
  nrc?: string,
) {
  const params = new URLSearchParams({
    ciclo: query.cycle,
    centro: query.center,
    materia: code,
    tipo: kind,
  });
  if (nrc) params.set("nrc", nrc);
  return `/alertas/nueva?${params.toString()}`;
}

const alertButton =
  "inline-block rounded-lg border border-emerald-700 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-950";

function groupBySubject(sections: readonly Section[]) {
  const groups = new Map<string, { code: string; name: string; sections: Section[] }>();
  for (const section of sections) {
    const group = groups.get(section.subjectCode) ?? {
      code: section.subjectCode,
      name: section.subjectName,
      sections: [],
    };
    group.sections.push(section);
    groups.set(section.subjectCode, group);
  }
  return [...groups.values()];
}

function siiauLink(query: SubjectQuery): string {
  return buildOfferUrl({
    cycle: query.cycle,
    center: query.center,
    ...(query.kind === "code" ? { subjectCode: query.value } : { subjectName: query.value }),
  }).href;
}

function Freshness({ result }: { result: SearchResponse }) {
  const fetchedAt = new Date(result.fetchedAt);
  return (
    <div className="space-y-2 text-sm text-stone-600 dark:text-stone-400">
      <p>
        Datos de SIIAU actualizados{" "}
        <time dateTime={result.fetchedAt} title={formatDateTime(fetchedAt)}>
          {formatRelativeTime(fetchedAt)}
        </time>
        . Los lugares cambian rápido: confirma en SIIAU antes de registrarte.
      </p>
      {result.freshness === "stale" ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
        >
          SIIAU no respondió hace un momento, así que mostramos los últimos datos que tenemos.
        </p>
      ) : null}
    </div>
  );
}

/** Asks SIIAU through the gateway (or reuses a recent answer) and renders the sections. */
export async function Results({ query }: { query: SubjectQuery }) {
  let result: SearchResponse;
  try {
    result = await searchOffer(query);
  } catch (error) {
    if (error instanceof SearchError) return <Problem kind={error.kind} />;
    throw error;
  }
  // A daily count for /impacto, written after the page is sent. Never who searched what.
  after(() => bumpMetric(getDb(), "searches", new Date()).catch(() => undefined));

  const groups = groupBySubject(result.sections);
  return (
    <section aria-labelledby="resultados" className="space-y-6">
      <div className="space-y-2">
        <h2 id="resultados" className="text-xl font-bold">
          {result.totalRecords === 0
            ? "Sin secciones"
            : `${String(result.totalRecords)} ${result.totalRecords === 1 ? "sección" : "secciones"}`}
        </h2>
        <Freshness result={result} />
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          <p>
            SIIAU no tiene secciones de <strong>{result.query.value}</strong> en el ciclo{" "}
            {result.query.cycle} para este centro.
          </p>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            Puede que la oferta de ese ciclo todavía no se publique, o que la clave o el nombre no
            coincidan. Revisa la clave en tu plan de estudios.
          </p>
          {result.query.kind === "code" ? (
            <p className="mt-3">
              <a href={alertHref(query, result.query.value, "offer")} className={alertButton}>
                Avísame cuando publiquen esta materia
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.code} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">
                <span className="font-mono">{group.code}</span> · {group.name}
              </h3>
              <a href={alertHref(query, group.code, "subject")} className={alertButton}>
                Avísame de cualquier sección
              </a>
            </div>
            <ul className="space-y-3">
              {group.sections.map((section) => (
                <SectionCard key={section.nrc} section={section}>
                  <a
                    href={alertHref(query, group.code, "section", section.nrc)}
                    className={alertButton}
                  >
                    {section.available > 0
                      ? "Avísame si se vuelve a liberar"
                      : "Avísame cuando haya lugar"}
                  </a>
                </SectionCard>
              ))}
            </ul>
          </div>
        ))
      )}

      <p className="text-sm">
        <a
          href={siiauLink(query)}
          target="_blank"
          rel="noreferrer"
          className="text-emerald-800 underline dark:text-emerald-300"
        >
          Ver esta consulta en SIIAU
        </a>
      </p>
    </section>
  );
}

export function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-3">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Consultando SIIAU… Le pedimos datos de uno en uno y con pausas, así que puede tardar unos
        segundos.
      </p>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-xl bg-stone-200 motion-reduce:animate-none dark:bg-stone-800"
        />
      ))}
    </div>
  );
}
