import type { Metadata } from "next";
import { Suspense } from "react";

import { Results, ResultsSkeleton } from "@/components/results";
import { SearchForm } from "@/components/search-form";
import { parseSearchParams } from "@/lib/subject-query";
import { getOptions } from "@/lib/worker";

export const metadata: Metadata = { title: "Buscar secciones" };

export default async function SearchPage({ searchParams }: PageProps<"/buscar">) {
  const params = await searchParams;
  const query = parseSearchParams(params);
  const options = await getOptions().catch(() => null);

  return (
    <div className="space-y-8">
      <h1 className="sr-only">Buscar secciones</h1>
      <SearchForm
        options={options}
        defaults={{
          cycle: query?.cycle,
          center: query?.center,
          subject: typeof params.materia === "string" ? params.materia : undefined,
        }}
      />
      {query ? (
        // The key restarts the fallback for every new search.
        <Suspense
          key={`${query.cycle}|${query.center}|${query.value}`}
          fallback={<ResultsSkeleton />}
        >
          <Results query={query} />
        </Suspense>
      ) : (
        <p className="text-stone-600 dark:text-stone-400">
          Elige ciclo y centro, y escribe la clave o parte del nombre de la materia.
        </p>
      )}
    </div>
  );
}
