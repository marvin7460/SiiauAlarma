import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EmailTransport } from "./transport";

/**
 * Writes each message as a JSON file. End-to-end tests read them to follow magic links and
 * to check alerts.
 */
export function createFileTransport(directory: string): EmailTransport {
  let counter = 0;
  return {
    async send(message) {
      await mkdir(directory, { recursive: true });
      counter += 1;
      const id = `${String(Date.now())}-${String(process.pid)}-${String(counter)}`;
      await writeFile(path.join(directory, `${id}.json`), JSON.stringify(message, null, 2));
      return { id };
    },
  };
}
