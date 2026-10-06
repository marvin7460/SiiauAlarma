import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startScheduler } from "./scheduler";

describe("startScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs shortly after start, then every interval", async () => {
    const run = vi.fn(() => Promise.resolve());
    const scheduler = startScheduler(run, { intervalMs: 60_000, firstRunAfterMs: 5_000 });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(55_000); // 60 s after start
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(3);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("never overlaps a run that is still going", async () => {
    let finish: () => void = () => undefined;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const scheduler = startScheduler(run, { intervalMs: 60_000, firstRunAfterMs: 0 });

    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(run).toHaveBeenCalledTimes(1);

    finish();
    await scheduler.idle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it("keeps going after a failed run", async () => {
    const onError = vi.fn();
    const run = vi.fn(() => Promise.reject(new Error("SIIAU down")));
    const scheduler = startScheduler(run, { intervalMs: 60_000, firstRunAfterMs: 0, onError });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(onError).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });
});
