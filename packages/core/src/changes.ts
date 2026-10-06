import type { Section } from "@haycupo/siiau";

export interface PreviousPoll {
  /** Free seats per NRC at the last successful poll. */
  available: ReadonlyMap<string, number>;
  /** Whether the subject had any sections then. */
  published: boolean;
}

export interface Changes {
  /** First poll of this subject: nothing to compare with, so nothing is "new". */
  baseline: boolean;
  /** Sections that went from 0 (or less) free seats to more than 0, or appeared with seats. */
  opened: Section[];
  /** Sections that went from free seats to none. */
  closed: Section[];
  /** The subject had no sections and now has some. */
  published: boolean;
}

/**
 * Compares two polls of the same subject. Pure: the caller decides what to do with it.
 *
 * Only transitions count. A section that has had 3 free seats for an hour is not news; one
 * that just went from 0 to 1 is.
 */
export function detectChanges(previous: PreviousPoll | null, current: readonly Section[]): Changes {
  if (previous === null) {
    return { baseline: true, opened: [], closed: [], published: false };
  }
  const opened: Section[] = [];
  const closed: Section[] = [];
  for (const section of current) {
    const before = previous.available.get(section.nrc);
    if (section.available > 0 && (before === undefined || before <= 0)) opened.push(section);
    if (section.available <= 0 && before !== undefined && before > 0) closed.push(section);
  }
  return {
    baseline: false,
    opened,
    closed,
    published: !previous.published && current.length > 0,
  };
}
