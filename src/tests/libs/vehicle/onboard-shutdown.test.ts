import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { shutdownBlockedBy, waitUntilOffline } from '@/libs/vehicle/onboard-shutdown'

const post = vi.fn(async (url: string, options?: unknown) => ({ ok: true, url, options }))
vi.mock('ky', () => ({
  default: { post: (url: string, options?: unknown) => post(url, options), get: vi.fn() },
  HTTPError: class {},
}))

// vitest 0.20 has no advanceTimersByTimeAsync: move the clock in small steps and let the promises run in between
const advance = async (ms: number): Promise<void> => {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    vi.advanceTimersByTime(Math.min(100, ms - elapsed))
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }
}

// Release 1.0, task 11: shut the onboard computer down from NaviLync before the main power is switched off
describe('when the onboard computer may be shut down', () => {
  test('only disarmed and slower than 0.2 m/s', () => {
    expect(shutdownBlockedBy(false, 0)).toBeUndefined()
    expect(shutdownBlockedBy(false, 0.19)).toBeUndefined()
    expect(shutdownBlockedBy(false, 0.2)).toBe('moving')
    expect(shutdownBlockedBy(false, 1.5)).toBe('moving')
  })

  test('armed, or the arming state unknown (no link to the autopilot): not disarmed', () => {
    expect(shutdownBlockedBy(true, 0)).toBe('notDisarmed')
    expect(shutdownBlockedBy(undefined, 0)).toBe('notDisarmed')
  })

  test('a speed that is not known is not taken for standing still', () => {
    expect(shutdownBlockedBy(false, undefined)).toBe('speedUnknown')
    expect(shutdownBlockedBy(false, Number.NaN)).toBe('speedUnknown')
  })
})

describe('the BlueOS power off command', () => {
  test('POST /commander/v1.0/shutdown with shutdown_type=poweroff, as the BlueOS power menu sends it', async () => {
    const { requestOnboardPoweroff } = await import('@/libs/blueos')
    post.mockClear()
    await requestOnboardPoweroff('192.168.2.2')

    expect(post).toHaveBeenCalledTimes(1)
    const [url, options] = post.mock.calls[0] as unknown as [
      string,
      {
        /**
         *
         */
        searchParams: Record<string, unknown>
      }
    ]
    expect(url).toMatch(/^https?:\/\/192\.168\.2\.2\/commander\/v1\.0\/shutdown$/)
    expect(options.searchParams).toEqual({ shutdown_type: 'poweroff', i_know_what_i_am_doing: true })
  })
})

// BlueOS answers the command and powers off 5 s later: the main power may go off only once it stopped answering
describe('waiting for the onboard computer to go off', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('off once it did not answer 3 checks in a row', async () => {
    const answers = [true, true, false, true, false, false, false]
    const isOnline = vi.fn(async () => answers.shift() ?? false)
    const result = waitUntilOffline(isOnline, 1000, 3, 90000)
    let settled: string | undefined
    void result.then((value) => (settled = value))

    for (let i = 0; i < 6; i++) await advance(1000)
    expect(settled).toBeUndefined()
    await advance(1000)
    expect(settled).toBe('off')
    expect(isOnline).toHaveBeenCalledTimes(7)
  })

  test('a check that fails with an error counts as not answering', async () => {
    const isOnline = vi.fn(async () => {
      throw new Error('Could not get BlueOS status')
    })
    const result = waitUntilOffline(isOnline, 1000, 3, 90000)
    await advance(3000)
    await expect(result).resolves.toBe('off')
  })

  test('timeout while it keeps answering', async () => {
    const result = waitUntilOffline(async () => true, 1000, 3, 10000)
    await advance(10000)
    await expect(result).resolves.toBe('timeout')
  })
})
