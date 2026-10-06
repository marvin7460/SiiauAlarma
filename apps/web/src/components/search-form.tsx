import type { OptionsResponse } from "@haycupo/worker/contract";
import Form from "next/form";

import { SubjectInput } from "./subject-input";

interface SearchFormProps {
  options: OptionsResponse | null;
  defaults?: { cycle?: string; center?: string; subject?: string };
}

const CENTER_SELECT_ID = "centro";

/** A plain GET form to /buscar: shareable URLs, and it works without JavaScript. */
export function SearchForm({ options, defaults = {} }: SearchFormProps) {
  if (!options) {
    return (
      <p
        role="alert"
        className="rounded-lg bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
      >
        No pudimos cargar la lista de ciclos y centros de SIIAU. Intenta de nuevo en unos minutos.
      </p>
    );
  }
  const field =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-900";
  return (
    <Form
      action="/buscar"
      className="grid gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:grid-cols-2 dark:border-stone-800 dark:bg-stone-900"
    >
      <label className="grid gap-1 text-sm font-medium">
        Ciclo
        <select
          name="ciclo"
          defaultValue={defaults.cycle ?? options.cycles[0]?.code}
          required
          className={field}
        >
          {options.cycles.map((cycle) => (
            <option key={cycle.code} value={cycle.code}>
              {cycle.code} · {cycle.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Centro universitario
        <select
          id={CENTER_SELECT_ID}
          name="centro"
          defaultValue={defaults.center ?? ""}
          required
          className={field}
        >
          <option value="" disabled>
            Elige tu centro
          </option>
          {options.centers.map((center) => (
            <option key={center.code} value={center.code}>
              {center.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-1 text-sm font-medium sm:col-span-2">
        <span aria-hidden="true">Materia</span>
        <SubjectInput
          name="materia"
          defaultValue={defaults.subject}
          centerSelectId={CENTER_SELECT_ID}
        />
      </div>
      <button
        type="submit"
        className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 sm:col-span-2"
      >
        Buscar secciones
      </button>
    </Form>
  );
}
