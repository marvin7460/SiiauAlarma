import { timestamp } from "drizzle-orm/pg-core";

/** Every timestamp is stored with time zone and read as a JS Date. */
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
