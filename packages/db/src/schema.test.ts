import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DbHandle } from "./client";
import { siiauGateway, subjects } from "./schema";
import { createTestDb } from "./testing";

describe("migrations", () => {
  let handle: DbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });
  afterEach(async () => {
    await handle.close();
  });

  it("create the gateway's single row", async () => {
    const rows = await handle.db.select().from(siiauGateway);

    expect(rows).toEqual([expect.objectContaining({ id: 1, consecutiveFailures: 0, trips: 0 })]);
  });

  it("refuse a second gateway row", async () => {
    await expect(handle.db.insert(siiauGateway).values({ id: 2 })).rejects.toThrow();
  });

  it("create working tables", async () => {
    await handle.db
      .insert(subjects)
      .values({ center: "D", code: "I5890", name: "BASES DE DATOS", lastSeenCycle: "202620" });

    const [row] = await handle.db.select().from(subjects).where(eq(subjects.code, "I5890"));
    expect(row?.name).toBe("BASES DE DATOS");
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });
});
