export const PROJECT_NAME = "HayCupo";
export const PROJECT_URL = "https://github.com/marvin7460/SiiauAlarma";

// No spaces, parentheses or semicolons: they would break the User-Agent comment syntax.
const CONTACT_EMAIL = /^[^\s@();]+@[^\s@();]+\.[^\s@();]+$/;

export interface UserAgentOptions {
  version: string;
  contactEmail: string;
}

/**
 * Identifies every request to SIIAU. The product token comes first because that is what
 * robots.txt groups are matched against; the comment tells the university's admins what
 * this is and how to reach the maintainer.
 */
export function buildUserAgent({ version, contactEmail }: UserAgentOptions): string {
  const email = contactEmail.trim();
  if (!CONTACT_EMAIL.test(email)) {
    throw new Error(
      "SIIAU_CONTACT_EMAIL must be a valid email address: it identifies our requests to SIIAU.",
    );
  }
  return `${PROJECT_NAME}/${version} (+${PROJECT_URL}; ${email})`;
}
