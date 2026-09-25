import { vi } from 'vitest'

/** Advance fake timers in small steps while flushing promise microtasks between steps. */
export const advanceTimers = async (ms: number, stepMs = 10): Promise<void> => {
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    vi.advanceTimersByTime(Math.min(stepMs, ms - elapsed))
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
  }
}
