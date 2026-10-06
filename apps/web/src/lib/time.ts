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
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "2026-10-06" in Guadalajara. Compare these, never formatted text (it varies by ICU version). */
const dayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "13:05", in Guadalajara's time. */
export function formatClockTime(date: Date): string {
  return clock.format(date);
}

/** "6 de octubre de 2026, 13:05" (the connector between date and time depends on ICU). */
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
  const sameDay = dayKey.format(date) === dayKey.format(now);
  return sameDay ? `a las ${formatClockTime(date)}` : `el ${formatDateTime(date)}`;
}
