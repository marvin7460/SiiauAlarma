import { formatDays } from "@haycupo/siiau";

import type { AlertFilters, AlertKind } from "./types";

export interface DescribableAlert {
  kind: AlertKind;
  nrc: string | null;
  subjectCode: string;
  subjectName: string | null;
  filters: AlertFilters;
}

function subjectLabel(alert: DescribableAlert): string {
  return alert.subjectName ? `${alert.subjectCode} ${alert.subjectName}` : alert.subjectCode;
}

/**
 * One line that tells the student what an alert is waiting for, in the alert list and in emails.
 *
 * TODO(Marvin): include the filters of "subject" alerts, in Spanish. Today they are left out.
 * Expected (tests in describe.test.ts; remove `.skip`):
 * - days: "Cualquier sección de I5890 BASES DE DATOS, solo lunes y jueves"
 * - times: "…, entre 07:00 y 13:00", "…, desde las 11:00", "…, hasta las 15:00"
 * - professor: "…, con PEREZ" (as typed, in uppercase)
 * - several filters are joined in that order: days, times, professor.
 * Hint: `formatDays` (from @haycupo/siiau) already says "lunes y jueves". Build an array of
 * pieces and join them with ", ".
 */
export function describeAlert(alert: DescribableAlert): string {
  switch (alert.kind) {
    case "section":
      return `NRC ${alert.nrc ?? "?"} de ${subjectLabel(alert)}`;
    case "subject":
      return `Cualquier sección de ${subjectLabel(alert)}`;
    case "offer":
      return `Cuando publiquen la oferta de ${subjectLabel(alert)}`;
  }
}

// Kept here so Marvin's version can use it without new imports.
export { formatDays };
