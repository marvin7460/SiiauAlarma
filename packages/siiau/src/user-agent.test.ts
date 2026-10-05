import { describe, expect, it } from "vitest";

import { buildUserAgent } from "./user-agent";

describe("buildUserAgent", () => {
  it("puts the product token first, then a link and the contact address", () => {
    expect(buildUserAgent({ version: "0.1.0", contactEmail: "  dev@example.com " })).toBe(
      "HayCupo/0.1.0 (+https://github.com/marvin7460/SiiauAlarma; dev@example.com)",
    );
  });

  it.each(["", "not-an-email", "a b@example.com", "dev@example.com)", "dev@example.com; x"])(
    "rejects %j as a contact address",
    (contactEmail) => {
      expect(() => buildUserAgent({ version: "0.1.0", contactEmail })).toThrow(
        /SIIAU_CONTACT_EMAIL/,
      );
    },
  );
});
