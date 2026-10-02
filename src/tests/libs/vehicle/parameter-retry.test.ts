import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { requestParametersWithRetry } from '@/libs/vehicle/parameter-retry'

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')

// Review of #39: a single PARAM_REQUEST_READ lost on the radio link left the speed check off for the whole session
describe('vehicle parameters for the mission check are asked for again', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('a parameter that does not come back is asked for again every 2 s, 3 times at most', () => {
    const request = vi.fn()
    requestParametersWithRetry(request, ['RO_SPEED_LIM', 'NAV_ACC_RAD'], () => false)
    expect(request).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(1999)
    expect(request).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    expect(request).toHaveBeenCalledTimes(4)
    vi.advanceTimersByTime(4000)
    expect(request).toHaveBeenCalledTimes(8)
    vi.advanceTimersByTime(20000)
    expect(request).toHaveBeenCalledTimes(8)
  })

  test('only the parameters still missing are asked for again; none once all came back', () => {
    const received = new Set<string>(['RO_SPEED_LIM'])
    const request = vi.fn()
    requestParametersWithRetry(request, ['RO_SPEED_LIM', 'NAV_ACC_RAD'], (name) => received.has(name))

    vi.advanceTimersByTime(2000)
    expect(request).toHaveBeenLastCalledWith('NAV_ACC_RAD')
    expect(request).toHaveBeenCalledTimes(3)
    received.add('NAV_ACC_RAD')
    vi.advanceTimersByTime(10000)
    expect(request).toHaveBeenCalledTimes(3)
  })

  test('asking stops when the vehicle goes offline', () => {
    const request = vi.fn()
    const stop = requestParametersWithRetry(request, ['RO_SPEED_LIM'], () => false)
    stop()
    vi.advanceTimersByTime(10000)
    expect(request).toHaveBeenCalledTimes(1)
  })

  test('the store asks with retries when a vehicle connects and stops when it goes offline', () => {
    const store = read('src/stores/mainVehicle.ts')
    expect(store).toMatch(/requestParametersWithRetry\(/)
    expect(store).toMatch(/'RO_SPEED_LIM', 'NAV_ACC_RAD'/)
    expect(store).toMatch(/stopMissionCheckParameterRequests\?\.\(\)/)
  })
})
