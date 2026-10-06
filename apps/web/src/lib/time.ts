/** Guadalajara's time zone (no daylight saving time since 2022). */
export const TIME_ZONE = "America/Mexico_City";

const clock = new Intl.DateTimeFormat("es-MX", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateTime = new Intl.DateTimeFormat("es-MX", {
  timeZone: TIME_ZONE,
  dateStyle: "long",
  timeStyle: "short",
});

/** "13:05", in Guadalajara's time. */
export function formatClockTime(date: Date): string {
  return clock.format(date);
}

/** "6 de octubre de 2026, 13:05". */
export function formatDateTime(date: Date): string {
  return dateTime.format(date);
}

/**
 * "hace un momento", "hace 3 minutos", "hace 2 horas", "hace 3 días".
 *
 * TODO(Marvin): implement this. The results page shows how old SIIAU's data is, and "hace 3
 * minutos" reads better than a clock time. Rules (tests in time.test.ts; remove `.skip`):
 * - Less than a minute (or a date slightly in the future, from clock drift): "hace un momento".
 * - Less than an hour: minutes; less than a day: hours; otherwise days. Always round down.
 * - Spanish singular and plural: "hace 1 minuto", "hace 2 minutos".
 * Hint: `Intl.RelativeTimeFormat("es-MX", { numeric: "always" })` formats
 * `rtf.format(-3, "minute")` as "hace 3 minutos". Compute the difference in milliseconds first.
 * Until then it shows the clock time ("a las 13:05", or the full date if it is not from today),
 * which is correct, just less friendly.
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const sameDay = formatDateTime(date).split(",")[0] === formatDateTime(now).split(",")[0];
  return sameDay ? `a las ${formatClockTime(date)}` : `el ${formatDateTime(date)}`;
}
