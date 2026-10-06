import { normalizeSubjectName, timeToMinutes, type Section } from "@haycupo/siiau";

import type { AlertFilters, AlertRule } from "./types";

/**
 * Does the section fit the student's filters? Every session must fit: a section with one
 * session at a bad time is still a bad section. Sessions without a schedule (online) never
 * clash, so they always fit.
 */
export function matchesFilters(section: Section, filters: AlertFilters): boolean {
  const { days, startAfter, endBefore, professor } = filters;
  for (const session of section.sessions) {
    if (days && session.days.some((day) => !days.includes(day))) return false;
    if (startAfter && session.start && timeToMinutes(session.start) < timeToMinutes(startAfter)) {
      return false;
    }
    if (endBefore && session.end && timeToMinutes(session.end) > timeToMinutes(endBefore)) {
      return false;
    }
  }
  if (professor) {
    const wanted = normalizeSubjectName(professor);
    const teaches = section.professors.some((p) => normalizeSubjectName(p.name).includes(wanted));
    if (!teaches) return false;
  }
  return true;
}

/** Is this section what the alert is waiting for? (Offer alerts are about the subject, not a section.) */
export function alertWantsSection(
  alert: Pick<AlertRule, "kind" | "nrc" | "filters">,
  section: Section,
): boolean {
  switch (alert.kind) {
    case "section":
      return section.nrc === alert.nrc;
    case "subject":
      return matchesFilters(section, alert.filters);
    case "offer":
      return false;
  }
}
