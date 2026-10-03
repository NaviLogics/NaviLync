import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  type ShutdownStage,
  type ShutdownSteps,
  shutdownBlockedBy,
  shutDownOnboardComputer,
  waitUntilOffline,
} from '@/libs/vehicle/onboard-shutdown'
import type { PingResult } from '@/types/network'

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
  for (let i = 0; i < 10; i++) await Promise.resolve()
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

/**
 * A shutdown under way, with what it reported so far
 */
interface RunningShutdown {
  /** The stages reported so far */
  stages: ShutdownStage[]
  /** The last stage, once the shutdown is over */
  result: () => ShutdownStage | undefined
  /** The steps it was given */
  steps: ShutdownSteps
}

// Answers in turn, then the last one forever
const inTurn = <T>(...answers: T[]): (() => Promise<T>) => {
  const queue = [...answers]
  return async () => (queue.length > 1 ? (queue.shift() as T) : queue[0])
}

const start = (steps: Partial<ShutdownSteps>): RunningShutdown => {
  const stages: ShutdownStage[] = []
  let result: ShutdownStage | undefined
  const all: ShutdownSteps = {
    ping: vi.fn(async (): Promise<PingResult> => 'reply'),
    status: vi.fn(async () => true),
    powerOff: vi.fn(async () => undefined),
    onStage: (stage) => stages.push(stage),
    ...steps,
  }
  void shutDownOnboardComputer(all).then((last) => (result = last))
  return { stages, result: () => result, steps: all }
}

const kinds = (stages: ShutdownStage[]): string[] => stages.map((stage) => stage.kind)

// Release 1.0, task 11: the main power may go off only once the onboard computer really is off
describe('shutting the onboard computer down', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('ping answers before the command: off after 5 missed pings in a row and 10 s more', async () => {
    const ping = vi.fn(inTurn<PingResult>('reply', 'reply', 'reply', 'noReply'))
    const shutdown = start({ ping })
    await advance(0)

    expect(shutdown.steps.powerOff).toHaveBeenCalledTimes(1)
    expect(shutdown.stages[0]).toEqual({ kind: 'shuttingDown', detection: 'ping' })

    // Pings at 1 and 2 s answer, 3 to 7 s do not: 5 misses at 7 s
    await advance(6900)
    expect(kinds(shutdown.stages)).not.toContain('finishing')
    await advance(100)
    expect(shutdown.stages.at(-1)).toEqual({ kind: 'finishing', secondsLeft: 10 })

    await advance(9500)
    expect(shutdown.result()).toBeUndefined()
    expect(shutdown.stages.at(-1)).toEqual({ kind: 'finishing', secondsLeft: 1 })
    await advance(500)
    expect(shutdown.result()).toEqual({ kind: 'off' })
    expect(shutdown.stages.at(-1)).toEqual({ kind: 'off' })
    expect(shutdown.steps.status).not.toHaveBeenCalled()
  })

  test('the misses must be in a row: a ping that answers again starts the count over', async () => {
    const ping = vi.fn(inTurn<PingResult>('reply', 'noReply', 'noReply', 'noReply', 'noReply', 'reply', 'noReply'))
    const shutdown = start({ ping })
    // Misses at 1–4 s, an answer at 5 s, then misses from 6 s: the 5th at 10 s
    await advance(9900)
    expect(kinds(shutdown.stages)).not.toContain('finishing')
    await advance(100)
    expect(kinds(shutdown.stages)).toContain('finishing')
  })

  test.each([
    ['no answer to ping before the command', async (): Promise<PingResult> => 'noReply'],
    ['no ping on the system or in the browser', async (): Promise<PingResult> => 'unavailable'],
    [
      'the ping itself fails',
      async (): Promise<PingResult> => {
        throw new Error('IPC failed')
      },
    ],
  ])('%s: BlueOS /status instead, off after 3 misses in a row and 20 s more', async (_, firstPing) => {
    const ping = vi.fn(firstPing)
    const status = vi.fn(inTurn(true, false))
    const shutdown = start({ ping, status })
    await advance(0)
    expect(shutdown.stages[0]).toEqual({ kind: 'shuttingDown', detection: 'status' })

    // /status answers at 1 s, not at 2, 3 and 4 s
    await advance(3900)
    expect(kinds(shutdown.stages)).not.toContain('finishing')
    await advance(100)
    expect(shutdown.stages.at(-1)).toEqual({ kind: 'finishing', secondsLeft: 20 })

    await advance(19500)
    expect(shutdown.result()).toBeUndefined()
    await advance(500)
    expect(shutdown.result()).toEqual({ kind: 'off' })
    expect(ping).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['ping', { ping: vi.fn(async (): Promise<PingResult> => 'reply') }],
    ['status', { ping: vi.fn(async (): Promise<PingResult> => 'unavailable'), status: vi.fn(async () => true) }],
  ])('%s: still answering 90 s after the command is a timeout, never off', async (_, steps) => {
    const shutdown = start(steps)
    await advance(89500)
    expect(shutdown.result()).toBeUndefined()
    await advance(500)

    expect(shutdown.result()).toEqual({ kind: 'timeout' })
    expect(kinds(shutdown.stages)).not.toContain('finishing')
    expect(kinds(shutdown.stages)).not.toContain('off')
  })

  test('the 90 s count the time, not the checks: slow pings do not stretch it', async () => {
    const ping = vi.fn(
      () =>
        new Promise<PingResult>((resolve) => {
          setTimeout(() => resolve('reply'), 1000)
        })
    )
    const shutdown = start({ ping })
    await advance(92000)
    expect(shutdown.result()).toEqual({ kind: 'timeout' })
  })

  test('the command fails: told so, nothing is watched', async () => {
    const shutdown = start({
      powerOff: vi.fn(async () => {
        throw new Error('timeout')
      }),
    })
    await advance(5000)

    expect(shutdown.result()).toEqual({ kind: 'failed', error: 'Error: timeout' })
    expect(kinds(shutdown.stages)).toEqual(['failed'])
    expect(shutdown.steps.ping).toHaveBeenCalledTimes(1)
    expect(shutdown.steps.status).not.toHaveBeenCalled()
  })
})
