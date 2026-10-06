/** Guadalajara's time zone (no daylight saving time since 2022). */
const TIME_ZONE = "America/Mexico_City";

const clock = new Intl.DateTimeFormat("es-MX", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "13:05" in Guadalajara. */
export function clockTime(date: Date): string {
  return clock.format(date);
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** "2027A" from "202710", "2026B" from "202620"; other codes as they are. */
export function cycleName(code: string): string {
  const match = /^(\d{4})(10|20)$/.exec(code);
  if (!match) return code;
  return `${match[1] ?? ""}${match[2] === "10" ? "A" : "B"}`;
}
