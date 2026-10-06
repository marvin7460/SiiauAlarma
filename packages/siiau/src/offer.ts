import { SiiauParseError } from "./errors";
import {
  allRows,
  extractTables,
  hasClass,
  roughText,
  type CellNode,
  type RowNode,
} from "./html-tables";
import {
  OfferPageSchema,
  WEEKDAYS,
  type OfferPage,
  type Professor,
  type Section,
  type Session,
  type Weekday,
} from "./model";

const DATA_CELL = "tddatos";
const PROFESSOR_CELL = "tdprofesor";
const DATA_FIELDS = 7;
/** Footer "Total de registros: N", read from the raw HTML (tags or &nbsp; may sit in between). */
const TOTAL_RECORDS = /total\s+de\s+registros\s*:?(?:\s|&nbsp;|<[^>]*>)*(\d+)/i;
const TIME_RANGE = /^(\d{2})(\d{2})\s*-\s*(\d{2})(\d{2})$/;
const DATE_RANGE = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/;
const DIGITS = /^\d+$/;

function fail(message: string, details?: unknown): never {
  throw new SiiauParseError(message, details);
}

/** Cells of a row and of every table nested in it, in document order. */
function* deepCells(row: RowNode): Generator<CellNode> {
  for (const cell of row.cells) {
    yield cell;
    for (const nested of allRows(cell.tables)) yield* nested.cells;
  }
}

function dataCells(row: RowNode): CellNode[] {
  return row.cells.filter((cell) => hasClass(cell, DATA_CELL));
}

/** A section row has the seven `td.tddatos` fields and starts with a numeric NRC. */
function isSectionRow(row: RowNode): boolean {
  const cells = dataCells(row);
  return cells.length >= DATA_FIELDS && DIGITS.test(cells[0]?.text ?? "");
}

function toInt(text: string, field: string, nrc: string): number {
  if (!/^-?\d+$/.test(text)) fail(`NRC ${nrc}: ${field} is not a number: "${text}"`);
  return Number(text);
}

function nullIfEmpty(text: string | undefined): string | null {
  return text ? text : null;
}

function parseTimeRange(text: string, nrc: string): Pick<Session, "start" | "end"> {
  if (text === "") return { start: null, end: null };
  const match = TIME_RANGE.exec(text);
  if (!match) fail(`NRC ${nrc}: unexpected time "${text}"`);
  const [, startHours, startMinutes, endHours, endMinutes] = match;
  return {
    start: `${startHours ?? ""}:${startMinutes ?? ""}`,
    end: `${endHours ?? ""}:${endMinutes ?? ""}`,
  };
}

/**
 * Six positions, Monday to Saturday, with "." for days without class ("L . . J . ."). We read
 * positions instead of letters, so it does not matter which letter SIIAU uses for each day.
 */
function parseDays(text: string, nrc: string): Weekday[] {
  if (text === "") return [];
  let tokens = text.split(" ");
  // Also accept the compact form "L..J.." (ASCII only, so splitting characters is safe).
  if (tokens.length !== WEEKDAYS.length) tokens = Array.from(text.replaceAll(" ", ""));
  if (tokens.length !== WEEKDAYS.length) fail(`NRC ${nrc}: unexpected days pattern "${text}"`);
  return WEEKDAYS.filter((_, index) => tokens[index] !== ".");
}

function toIsoDate(day: string, month: string, year: string): string {
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month}-${day}`;
}

function parseDateRange(text: string, nrc: string): Pick<Session, "startDate" | "endDate"> {
  if (text === "") return { startDate: null, endDate: null };
  const match = DATE_RANGE.exec(text);
  if (!match) fail(`NRC ${nrc}: unexpected period "${text}"`);
  const [, d1 = "", m1 = "", y1 = "", d2 = "", m2 = "", y2 = ""] = match;
  return { startDate: toIsoDate(d1, m1, y1), endDate: toIsoDate(d2, m2, y2) };
}

function parseSessions(row: RowNode, nrc: string): Session[] {
  const nestedRows = row.cells.flatMap((cell) => [...allRows(cell.tables)]);
  return nestedRows
    .filter((nested) => !nested.cells.some((cell) => hasClass(cell, PROFESSOR_CELL)))
    .filter((nested) => nested.cells.length >= 6 && DIGITS.test(nested.cells[0]?.text ?? ""))
    .map((nested) => {
      const [number = "", time = "", days = "", building, room, period = ""] = nested.cells.map(
        (cell) => cell.text,
      );
      return {
        number,
        ...parseTimeRange(time, nrc),
        days: parseDays(days, nrc),
        building: nullIfEmpty(building),
        room: nullIfEmpty(room),
        ...parseDateRange(period, nrc),
      };
    });
}

/** `td.tdprofesor` cells come in (session, name) pairs; the session number may be missing. */
function parseProfessors(row: RowNode): Professor[] {
  const professors: Professor[] = [];
  let pendingSession: string | null = null;
  for (const cell of deepCells(row)) {
    if (!hasClass(cell, PROFESSOR_CELL) || cell.text === "") continue;
    if (/^\d{1,2}$/.test(cell.text)) {
      pendingSession = cell.text;
    } else {
      professors.push({ session: pendingSession, name: cell.text });
      pendingSession = null;
    }
  }
  return professors;
}

function parseSectionRow(row: RowNode): Section {
  const [nrc = "", subjectCode = "", subjectName = "", section = "", credits = "", capacity = ""] =
    dataCells(row).map((cell) => cell.text);
  const available = dataCells(row)[6]?.text ?? "";
  return {
    nrc,
    subjectCode: subjectCode.toUpperCase(),
    subjectName,
    section,
    credits: toInt(credits, "credits (CR)", nrc),
    capacity: toInt(capacity, "capacity (CUP)", nrc),
    available: toInt(available, "available (DIS)", nrc),
    sessions: parseSessions(row, nrc),
    professors: parseProfessors(row),
  };
}

/**
 * Parses the results page of `sspseca.consulta_oferta` (see docs/siiau.md §4).
 *
 * It is strict on purpose: if the footer is missing, a field does not parse, or the data does
 * not validate, it throws `SiiauParseError` instead of returning something half right.
 */
export function parseOfferPage(html: string): OfferPage {
  const totalMatch = TOTAL_RECORDS.exec(html);
  if (!totalMatch) {
    fail("Missing 'Total de registros' footer: SIIAU may have changed its results page", {
      text: roughText(html),
    });
  }
  const totalRecords = Number(totalMatch[1]);
  const sections = [...allRows(extractTables(html))].filter(isSectionRow).map(parseSectionRow);

  if (totalRecords > 0 && sections.length === 0) {
    fail(`Footer reports ${totalRecords} records but no section rows were recognized`);
  }
  if (sections.length > totalRecords) {
    fail(`Found ${sections.length} sections but the footer reports ${totalRecords}`);
  }
  const duplicated = sections.find((s, i) => sections.findIndex((o) => o.nrc === s.nrc) !== i);
  if (duplicated) fail(`NRC ${duplicated.nrc} appears twice`);

  const result = OfferPageSchema.safeParse({ totalRecords, sections });
  if (!result.success) fail("Section data did not validate", result.error.issues);
  return result.data;
}
