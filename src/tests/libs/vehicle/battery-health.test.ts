import { describe, expect, test } from 'vitest'

import { isCurrentMeasured, lowVoltageThreshold, LowVoltageWatch } from '@/libs/vehicle/battery-health'

// Release 1.0, task 9 (narrowed): the motor ESCs on the 24 V bus bypass the power module
describe('whether the power module measures the current', () => {
  test('only a reading over 0.5 A shows it does', () => {
    expect(isCurrentMeasured(0.51)).toBe(true)
    expect(isCurrentMeasured(12)).toBe(true)
    expect(isCurrentMeasured(0.5)).toBe(false)
    expect(isCurrentMeasured(0)).toBe(false)
    expect(isCurrentMeasured(-2)).toBe(false)
  })

  test('-1 from the vehicle (undefined here) is not measured', () => {
    expect(isCurrentMeasured(undefined)).toBe(false)
  })
})

describe('the low battery voltage', () => {
  test('3.5 V per cell from BAT1_N_CELLS: 6S is 21.0 V', () => {
    expect(lowVoltageThreshold(6)).toBe(21)
    expect(lowVoltageThreshold(4)).toBe(14)
  })

  test('no valid cell count, no threshold', () => {
    expect(lowVoltageThreshold(undefined)).toBeUndefined()
    expect(lowVoltageThreshold(0)).toBeUndefined()
    expect(lowVoltageThreshold(-1)).toBeUndefined()
    expect(lowVoltageThreshold(2.5)).toBeUndefined()
    expect(lowVoltageThreshold(Number.NaN)).toBeUndefined()
  })
})

// The store brings the watch up to date every 100 ms
const run = (
  watch: LowVoltageWatch,
  from: number,
  to: number,
  voltage: number | undefined,
  threshold = 21
): string[] => {
  const changes: string[] = []
  for (let now = from; now <= to; now += 100) {
    const change = watch.update(now, voltage, threshold)
    if (change) changes.push(`${change}@${now}`)
  }
  return changes
}

describe('low voltage for over 3 s', () => {
  test('under 21.0 V for 3 s: low, told once', () => {
    const watch = new LowVoltageWatch()
    expect(run(watch, 0, 2900, 20.9)).toEqual([])
    expect(watch.low).toBe(false)
    expect(run(watch, 3000, 10000, 20.9)).toEqual(['started@3000'])
    expect(watch.low).toBe(true)
  })

  test('dips shorter than 3 s do not count, and each dip counts from its start', () => {
    const watch = new LowVoltageWatch()
    expect(run(watch, 0, 2500, 20.5)).toEqual([])
    expect(run(watch, 2600, 3000, 22.4)).toEqual([])
    expect(run(watch, 3100, 5800, 20.5)).toEqual([])
    expect(watch.low).toBe(false)
  })

  test('back to 21.0 V or over for 3 s: no longer low; a shorter rise keeps it low', () => {
    const watch = new LowVoltageWatch()
    run(watch, 0, 3000, 20.8)
    expect(run(watch, 3100, 5000, 21.2)).toEqual([])
    expect(run(watch, 5100, 6000, 20.8)).toEqual([])
    expect(watch.low).toBe(true)
    expect(run(watch, 6100, 9000, 21.0)).toEqual([])
    expect(run(watch, 9100, 9100, 21.0)).toEqual(['ended@9100'])
    expect(watch.low).toBe(false)
  })

  test('an unknown voltage or cell count starts the count over and raises nothing', () => {
    const watch = new LowVoltageWatch()
    run(watch, 0, 2000, 20.8)
    run(watch, 2100, 2100, undefined)
    expect(run(watch, 2200, 5000, 20.8)).toEqual([])
    const noCells = new LowVoltageWatch()
    expect(noCells.update(0, 10, undefined)).toBeUndefined()
    expect(noCells.update(10000, 10, undefined)).toBeUndefined()
    expect(noCells.low).toBe(false)
  })
})
