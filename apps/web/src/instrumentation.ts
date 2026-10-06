/**
 * Runs once when the Next.js server starts, before it takes requests: applies pending database
 * migrations and starts the poller that checks SIIAU every minute (see src/server/startup.ts).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startServer } = await import("./server/startup");
  await startServer();
}
