import { z } from "zod";

/** Class days, Monday to Saturday, in the order SIIAU prints them. */
export const WEEKDAYS = ["LU", "MA", "MI", "JU", "VI", "SA"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

export const SessionSchema = z.object({
  /** Session number as printed ("01"). Professors refer to it. */
  number: z.string().regex(/^\d{1,2}$/),
  start: time.nullable(),
  end: time.nullable(),
  days: z.array(z.enum(WEEKDAYS)),
  building: z.string().nullable(),
  room: z.string().nullable(),
  startDate: z.iso.date().nullable(),
  endDate: z.iso.date().nullable(),
});

export const ProfessorSchema = z.object({
  /** Session the professor teaches, when SIIAU says. */
  session: z.string().nullable(),
  /** As SIIAU prints it: "APELLIDOS, NOMBRE". */
  name: z.string().min(1),
});

export const SectionSchema = z.object({
  nrc: z.string().regex(/^\d{1,7}$/),
  subjectCode: z.string().regex(/^[A-Z0-9]{2,10}$/),
  subjectName: z.string().min(1),
  section: z.string().min(1).max(10),
  credits: z.number().int().min(0),
  /** CUP: total seats. */
  capacity: z.number().int().min(0),
  /** DIS: free seats. Kept as SIIAU reports it; only > 0 means a seat is open. */
  available: z.number().int(),
  sessions: z.array(SessionSchema),
  professors: z.array(ProfessorSchema),
});

export const OfferPageSchema = z.object({
  /** "Total de registros: N" from the page footer. */
  totalRecords: z.number().int().min(0),
  sections: z.array(SectionSchema),
});

export type Session = z.infer<typeof SessionSchema>;
export type Professor = z.infer<typeof ProfessorSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type OfferPage = z.infer<typeof OfferPageSchema>;

export interface CycleOption {
  /** Value sent as `ciclop`, e.g. "202620". */
  code: string;
  /** Description shown by SIIAU, e.g. "Calendario 26 B". */
  label: string;
}

export interface CenterOption {
  /** Value sent as `cup`, e.g. "D". */
  code: string;
  name: string;
}

export interface SearchForm {
  cycles: CycleOption[];
  centers: CenterOption[];
}

/** "13:05" → 785. */
export function timeToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
