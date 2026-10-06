export interface Scheduler {
  stop: () => void;
  /** Resolves when the run in progress (if any) has finished. */
  idle: () => Promise<void>;
}

export interface SchedulerOptions {
  intervalMs?: number;
  /** The first run, shortly after the server starts. */
  firstRunAfterMs?: number;
  onError?: (error: unknown) => void;
}

/**
 * Runs `run` every minute inside the server process (Next.js starts it from
 * instrumentation.ts). A run that takes longer than the interval is never overlapped by the
 * next one: that tick is skipped. The timers do not keep the process alive on shutdown.
 */
export function startScheduler(
  run: () => Promise<unknown>,
  { intervalMs = 60_000, firstRunAfterMs = 5_000, onError = console.error }: SchedulerOptions = {},
): Scheduler {
  let running: Promise<void> | null = null;
  const tick = () => {
    if (running) return;
    running = run()
      .then(() => undefined)
      .catch(onError)
      .finally(() => {
        running = null;
      });
  };
  const first = setTimeout(tick, firstRunAfterMs);
  const timer = setInterval(tick, intervalMs);
  first.unref();
  timer.unref();
  return {
    stop: () => {
      clearTimeout(first);
      clearInterval(timer);
    },
    idle: () => running ?? Promise.resolve(),
  };
}
