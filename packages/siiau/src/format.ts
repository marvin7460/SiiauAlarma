import type { Session, Weekday } from "./model";

/** Spanish text for the app. Names stay as SIIAU prints them unless noted. */

const DAY_NAMES: Record<Weekday, string> = {
  LU: "lunes",
  MA: "martes",
  MI: "miércoles",
  JU: "jueves",
  VI: "viernes",
  SA: "sábado",
};

/** ["LU", "JU"] → "lunes y jueves"; ["LU", "MI", "VI"] → "lunes, miércoles y viernes". */
export function formatDays(days: readonly Weekday[]): string {
  const names = days.map((day) => DAY_NAMES[day]);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1) ?? ""}`;
}

/** "13:00–14:55", or "" when the session has no schedule. */
export function formatTimeRange(session: Pick<Session, "start" | "end">): string {
  return session.start && session.end ? `${session.start}–${session.end}` : "";
}

/** "lunes y jueves, 13:00–14:55 · DUCT1 LC03". */
export function formatSession(session: Session): string {
  const when = [formatDays(session.days), formatTimeRange(session)].filter(Boolean).join(", ");
  const where = [session.building, session.room].filter(Boolean).join(" ");
  return [when || "Sin horario", where].filter(Boolean).join(" · ");
}

/**
 * "MUÑOZ PEÑA, JOSE ANGEL" → "Jose Angel Muñoz Peña".
 *
 * TODO(Marvin): implement this. SIIAU prints professors as "APELLIDOS, NOMBRES" in uppercase;
 * the app should show "Nombres Apellidos" in title case. Rules (the tests in format.test.ts
 * describe them; remove `.skip` when you start):
 * - Swap the parts around the first comma. No comma? Just title-case the whole thing.
 * - Title-case each word, keeping Ñ and accents ("PEÑA" → "Peña").
 * - Particles (de, del, la, las, los, y) are lowercase, except when they start the given
 *   names or the surnames: "MARIA DE LA LUZ" → "Maria de la Luz", but "DE LA TORRE" → "De la Torre".
 * - Extra spaces are collapsed; an empty input returns "".
 * Hint: `toLocaleLowerCase("es-MX")`, then uppercase the first letter of each word.
 * Until then it returns the name unchanged, so the app still works.
 */
export function formatProfessorName(name: string): string {
  return name;
}
