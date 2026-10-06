import { connection } from "next/server";

import { SearchForm } from "@/components/search-form";
import { getOptions } from "@/lib/worker";

export default async function HomePage() {
  // Render per request: a page prerendered at build time would freeze an unavailable worker.
  await connection();
  const options = await getOptions().catch(() => null);
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Entérate cuando se libere un lugar en tu materia
        </h1>
        <p className="text-lg text-stone-700 dark:text-stone-300">
          Busca tu materia, mira cuántos lugares quedan en cada sección y pide que te avisemos
          cuando alguien la dé de baja. Sin recargar SIIAU cada cinco minutos.
        </p>
      </section>

      <SearchForm options={options} />

      <section aria-labelledby="como-funciona" className="space-y-4">
        <h2 id="como-funciona" className="text-xl font-bold">
          Cómo funciona
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {[
            [
              "Busca",
              "Elige ciclo, centro y materia. Verás cada sección con su horario y profesor.",
            ],
            ["Pide un aviso", "Para un NRC o para cualquier sección que te acomode."],
            ["Regístrate", "Cuando se libere un lugar te avisamos con el NRC, listo para SIIAU."],
          ].map(([title, text], index) => (
            <li
              key={title}
              className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
            >
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Paso {index + 1}
              </p>
              <p className="font-semibold">{title}</p>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="uso-responsable" className="space-y-2">
        <h2 id="uso-responsable" className="text-xl font-bold">
          Cuidamos a SIIAU
        </h2>
        <p className="text-stone-700 dark:text-stone-300">
          Consultamos una materia a la vez, con pausas entre consultas, y solo las materias que
          alguien está esperando. Si SIIAU falla varias veces seguidas, nos detenemos.
        </p>
      </section>
    </div>
  );
}
