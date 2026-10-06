import type { ApiErrorKind } from "@haycupo/worker/contract";

import { PROBLEM_MESSAGES } from "@/lib/problems";

export function Problem({ kind }: { kind: ApiErrorKind }) {
  const message = PROBLEM_MESSAGES[kind];
  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="font-semibold">{message.title}</p>
      <p className="mt-1 text-sm">{message.detail}</p>
    </div>
  );
}
