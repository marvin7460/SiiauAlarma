import { formatProfessorName, formatSession, type Section } from "@haycupo/siiau";

export function SeatBadge({ available }: { available: number }) {
  if (available > 0) {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-semibold text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">
        {available === 1 ? "1 lugar" : `${String(available)} lugares`}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-sm font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-300">
      Sin lugares
    </span>
  );
}

export function SectionCard({
  section,
  children,
}: {
  section: Section;
  children?: React.ReactNode;
}) {
  const professors = section.professors.map((professor) => formatProfessorName(professor.name));
  return (
    <li className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          NRC <span className="font-mono">{section.nrc}</span>
          <span className="text-stone-500"> · Sección {section.section}</span>
        </p>
        <SeatBadge available={section.available} />
      </div>
      <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-stone-500">Cupo</dt>
        <dd>
          {section.available > 0 ? String(section.available) : "0"} de {String(section.capacity)}{" "}
          disponibles
        </dd>
        <dt className="text-stone-500">Horario</dt>
        <dd>
          {section.sessions.length === 0 ? (
            "Sin horario publicado"
          ) : (
            <ul>
              {section.sessions.map((session) => (
                <li key={session.number}>{formatSession(session)}</li>
              ))}
            </ul>
          )}
        </dd>
        <dt className="text-stone-500">{professors.length > 1 ? "Profesores" : "Profesor"}</dt>
        <dd>{professors.length > 0 ? professors.join("; ") : "Sin profesor asignado"}</dd>
      </dl>
      {children ? <div className="mt-3">{children}</div> : null}
    </li>
  );
}
