import { afterEach, expect, test, vi } from 'vitest'

const posthogInit = vi.fn((...args: unknown[]) => {
  void args
  return { get_distinct_id: () => 'test' }
})
const kyPost = vi.fn(async (...args: unknown[]) => {
  void args
})

vi.mock('posthog-js', () => ({ default: { init: (...args: unknown[]) => posthogInit(...args) } }))
vi.mock('ky', () => ({ default: { post: (...args: unknown[]) => kyPost(...args) } }))
// jsdom has no IndexedDB; keep the tracker's event queue in memory.
vi.mock('localforage', () => ({
  default: {
    INDEXEDDB: 'indexeddb',
    createInstance: () => {
      const items = new Map<string, unknown>()
      return {
        setItem: async (key: string, value: unknown) => items.set(key, value),
        getItem: async (key: string) => items.get(key),
        removeItem: async (key: string) => items.delete(key),
        keys: async () => [...items.keys()],
      }
    },
  },
}))

afterEach(() => {
  vi.useRealTimers()
})

// The Cockpit tracker reports to Blue Robotics' PostHog project in every production build. NaviLync is run by
// NaviLogics for NAVIS ATLAS, and nothing may leave the station for a third-party analytics service.
test('a production build neither initialises PostHog nor sends events', async () => {
  vi.useFakeTimers()
  const env = import.meta.env as Record<string, unknown>
  const wasProduction = env.PROD
  env.PROD = true
  try {
    const { default: eventTracker } = await import('@/libs/external-telemetry/event-tracking')
    await eventTracker.capture('Vehicle armed')
    vi.advanceTimersByTime(60_000)
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
  } finally {
    env.PROD = wasProduction
  }

  expect(posthogInit).not.toHaveBeenCalled()
  expect(kyPost).not.toHaveBeenCalled()
})
