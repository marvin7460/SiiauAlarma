import { describe, expect, it } from "vitest";

import { robotsPolicyFromResponse, unreachableRobotsPolicy } from "./robots";

const robotsUrl = new URL("https://siiauescolar.siiau.udg.mx/robots.txt");
const offerUrl = new URL("https://siiauescolar.siiau.udg.mx/wal/sspseca.consulta_oferta?cup=D");
const userAgent = "HayCupo/0.1.0 (+https://github.com/marvin7460/SiiauAlarma; dev@example.com)";

function policyFor(body: string, status = 200) {
  return robotsPolicyFromResponse({ robotsUrl, status, body, userAgent });
}

describe("robotsPolicyFromResponse", () => {
  it("allows everything when robots.txt has no rules for us", () => {
    const policy = policyFor("User-agent: *\nDisallow:\n");

    expect(policy.isAllowed(offerUrl)).toBe(true);
    expect(policy.crawlDelayMs).toBeUndefined();
  });

  it("obeys the wildcard group", () => {
    const policy = policyFor("User-agent: *\nDisallow: /wal/\n");

    expect(policy.isAllowed(offerUrl)).toBe(false);
  });

  it("prefers the group for our product token over the wildcard", () => {
    const policy = policyFor(
      ["User-agent: *", "Disallow: /", "", "User-agent: HayCupo", "Allow: /wal/"].join("\n"),
    );

    expect(policy.isAllowed(offerUrl)).toBe(true);
  });

  it("reports Crawl-delay in milliseconds", () => {
    const policy = policyFor("User-agent: *\nCrawl-delay: 5\n");

    expect(policy.crawlDelayMs).toBe(5000);
  });

  it("never allows URLs from another origin", () => {
    const policy = policyFor("User-agent: *\nDisallow:\n");

    expect(policy.isAllowed(new URL("http://consulta.siiau.udg.mx/wco/x.y"))).toBe(false);
  });

  it("treats a 4xx robots.txt as unavailable: no restrictions on that origin", () => {
    const policy = policyFor("Not found", 404);

    expect(policy.isAllowed(offerUrl)).toBe(true);
    expect(policy.isAllowed(new URL("https://example.com/"))).toBe(false);
  });

  it.each([429, 500, 503, 302])(
    "treats status %i as unreachable: everything disallowed",
    (status) => {
      expect(policyFor("", status).isAllowed(offerUrl)).toBe(false);
    },
  );
});

describe("unreachableRobotsPolicy", () => {
  it("disallows everything", () => {
    expect(unreachableRobotsPolicy().isAllowed(offerUrl)).toBe(false);
  });
});
