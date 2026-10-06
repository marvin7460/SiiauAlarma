import { WEEKDAYS, type Section } from "@haycupo/siiau";

import { createAlertAction } from "@/app/actions";

import { SectionCard } from "./section-card";

const DAY_LABELS = { LU: "Lun", MA: "Mar", MI: "Mié", JU: "Jue", VI: "Vie", SA: "Sáb" } as const;
const HOURS = Array.from({ length: 16 }, (_, index) => `${String(index + 7).padStart(2, "0")}:00`);

interface AlertFormProps {
  kind: "section" | "subject" | "offer";
  cycle: string;
  center: string;
  subjectCode: string;
  subjectName: string | null;
  section: Section | null;
  /** This page's URL, to come back to with an error. */
  backTo: string;
}

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-900";

/** Confirms what will be watched and, for "any section", lets the student narrow it down. */
export function AlertForm(props: AlertFormProps) {
  const title = props.subjectName
    ? `${props.subjectCode} · ${props.subjectName}`
    : props.subjectCode;
  return (
    <form action={createAlertAction} className="space-y-6">
      <input type="hidden" name="ciclo" value={props.cycle} />
      <input type="hidden" name="centro" value={props.center} />
      <input type="hidden" name="materia" value={props.subjectCode} />
      <input type="hidden" name="tipo" value={props.kind} />
      <input type="hidden" name="volver" value={props.backTo} />
      {props.section ? <input type="hidden" name="nrc" value={props.section.nrc} /> : null}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {props.kind === "section" && props.section ? (
          <>
            <p className="text-stone-700 dark:text-stone-300">
              Te avisamos cuando esta sección pase de 0 a 1 o más lugares libres.
            </p>
            <ul>
              <SectionCard section={props.section} />
            </ul>
          </>
        ) : null}
        {props.kind === "subject" ? (
          <p className="text-stone-700 dark:text-stone-300">
            Te avisamos cuando se libere un lugar en cualquier sección que cumpla lo que elijas
            abajo. Si no eliges nada, cualquier sección cuenta.
          </p>
        ) : null}
        {props.kind === "offer" ? (
          <p className="text-stone-700 dark:text-stone-300">
            Esta materia todavía no tiene secciones en el ciclo {props.cycle}. Te avisamos en cuanto
            SIIAU las publique (revisamos una vez por hora).
          </p>
        ) : null}
      </div>

      {props.kind === "subject" ? (
        <fieldset className="space-y-4 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
          <legend className="px-1 text-sm font-semibold">Filtros (opcionales)</legend>
          <div>
            <p className="text-sm font-medium">Días en que puedes ir</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <label
                  key={day}
                  className="flex items-center gap-1 rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-700"
                >
                  <input type="checkbox" name="dias" value={day} defaultChecked />
                  {DAY_LABELS[day]}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              Que empiece desde las
              <select name="desde" defaultValue="" className={field}>
                <option value="">Cualquier hora</option>
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Que termine antes de las
              <select name="hasta" defaultValue="" className={field}>
                <option value="">Cualquier hora</option>
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Profesor (parte del nombre)
            <input
              name="profesor"
              maxLength={60}
              placeholder="Por ejemplo: PEREZ"
              className={field}
            />
          </label>
        </fieldset>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Cómo te avisamos</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="canales" value="email" defaultChecked />
          Correo
        </label>
      </fieldset>

      <button
        type="submit"
        className="w-full rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800"
      >
        Crear alerta
      </button>
      <p className="text-xs text-stone-600 dark:text-stone-400">
        La alerta se apaga sola al terminar el periodo de registro. Puedes cancelarla cuando
        quieras.
      </p>
    </form>
  );
}
