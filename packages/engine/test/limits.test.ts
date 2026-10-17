import { rateLimits } from "@haycupo/db";
import { describe, expect, it } from "vitest";

import { allow, fingerprint, LIMITS, takeHit } from "../src/limits";
import { searchOffer } from "../src/search";
import { handleTelegramUpdate } from "../src/telegram-bot";
import { useHarness } from "./harness";

const MINUTE = 60_000;

describe("takeHit", () => {
  const h = useHarness();
  const limit = { max: 3, windowMs: 10 * MINUTE };
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 6, 12, minutes));

  it("allows up to the limit in a window, then refuses", async () => {
    const answers = [];
    for (let i = 0; i < 5; i++) answers.push(await takeHit(h.db, "login:abc", limit, at(1)));

    expect(answers).toEqual([true, true, true, false, false]);
  });

  it("starts counting again in the next window", async () => {
    for (let i = 0; i < 4; i++) await takeHit(h.db, "login:abc", limit, at(1));

    expect(await takeHit(h.db, "login:abc", limit, at(11))).toBe(true);
    const [row] = await h.db.select().from(rateLimits);
    expect(row?.hits).toBe(1);
  });

  it("keeps each key apart", async () => {
    for (let i = 0; i < 3; i++) await takeHit(h.db, "login:abc", limit, at(1));

    expect(await takeHit(h.db, "login:abc", limit, at(1))).toBe(false);
    expect(await takeHit(h.db, "login:xyz", limit, at(1))).toBe(true);
    expect(await allow(h.db, "alertsPerUser", "user-1", at(1))).toBe(true);
  });

  it("counts concurrent hits exactly (one atomic write each)", async () => {
    const answers = await Promise.all(
      Array.from({ length: 10 }, () => takeHit(h.db, "burst", limit, at(1))),
    );

    expect(answers.filter(Boolean)).toHaveLength(3);
  });
});

describe("fingerprint", () => {
  it("hides the value, is stable, and depends on the secret", async () => {
    const one = await fingerprint("secret-a".repeat(5), "201.141.10.7");

    expect(one).toMatch(/^[\w-]{22}$/);
    expect(one).not.toContain("201");
    expect(await fingerprint("secret-a".repeat(5), "201.141.10.7")).toBe(one);
    expect(await fingerprint("secret-b".repeat(5), "201.141.10.7")).not.toBe(one);
    expect(await fingerprint("secret-a".repeat(5), "201.141.10.8")).not.toBe(one);
  });
});

describe("abuse limits in the engine", () => {
  const h = useHarness();

  it("goes quiet for a chat that floods the bot", async () => {
    const deps = { db: h.db, appUrl: "https://example.com" };
    const message = (id: number) => ({
      update_id: id,
      message: {
        message_id: id,
        date: 0,
        chat: { id: 4242, type: "private" },
        text: "/ayuda",
      },
    });
    const replies = [];
    for (let i = 0; i <= LIMITS.botMessagesPerChat.max; i++) {
      replies.push(await handleTelegramUpdate(deps, message(i)));
    }

    expect(replies.slice(0, -1).every((reply) => reply !== null)).toBe(true);
    expect(replies.at(-1)).toBeNull();
  });

  it("refuses searches that need SIIAU past the limit, but still answers from the cache", async () => {
    const query = { cycle: "202620", center: "D", kind: "code", value: "I5890" } as const;
    const base = { db: h.db, gateway: h.gateway, cacheTtlMs: 300_000 };
    await searchOffer({ ...base, allowFetch: () => Promise.resolve(true) }, query);

    const cached = await searchOffer({ ...base, allowFetch: () => Promise.resolve(false) }, query);
    expect(cached.freshness).toBe("cached");

    await expect(
      searchOffer(
        { ...base, allowFetch: () => Promise.resolve(false) },
        { ...query, value: "I5898" },
      ),
    ).rejects.toMatchObject({ kind: "rate_limited" });
    expect(h.fake.requests.filter((r) => r.path.includes("consulta_oferta"))).toHaveLength(1);
  });
});
