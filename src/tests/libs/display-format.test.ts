import { describe, expect, test } from 'vitest'

import {
  formatClockDateTime,
  gpsFixVariableFor,
  indicatorDisplayName,
  indicatorDisplayUnit,
  isGpsSpeedShowable,
  isGpsSpeedVariable,
} from '@/libs/display-format'
import en from '@/locales/en.json'
import ru from '@/locales/ru.json'

const valuesWithPaths = (node: unknown, path = ''): [string, string][] =>
  typeof node === 'string'
    ? [[path, node]]
    : Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
        valuesWithPaths(value, path ? `${path}.${key}` : key)
      )
const translator =
  (locale: object) =>
  (key: string): string =>
    Object.fromEntries(valuesWithPaths(locale))[key] ?? key

// Branding task, item 5
describe('top bar clock', () => {
  const sundayMidnight = new Date(2026, 8, 27, 0, 0)

  test('in Russian: «Вс 27 сент. 00:00»', () => {
    expect(formatClockDateTime(sundayMidnight, 'ru')).toBe('Вс 27 сент. 00:00')
  })

  test('in English: as before', () => {
    expect(formatClockDateTime(sundayMidnight, 'en')).toBe('Sun Sep 27th 00:00')
  })
})

// Branding task, item 4: a boat standing still showed 8 to 91 m/s in the lab
describe('GPS speed is shown only with a 3D fix and fresh data', () => {
  const now = 100_000

  test.each([
    ['GPS_FIX_TYPE_NO_FIX', false],
    [1, false],
    ['GPS_FIX_TYPE_2D_FIX', false],
    [2, false],
    ['GPS_FIX_TYPE_3D_FIX', true],
    [3, true],
    ['GPS_FIX_TYPE_RTK_FLOAT', true],
    ['GPS_FIX_TYPE_RTK_FIXED', true],
    [6, true],
    [undefined, false],
  ])('fix_type %s → shown: %s', (fixType, shown) => {
    expect(isGpsSpeedShowable({ fixType, fixUpdatedAt: now - 500, speedUpdatedAt: now - 500, now })).toBe(shown)
  })

  test('no speed for more than 3 s → not shown', () => {
    expect(isGpsSpeedShowable({ fixType: 3, fixUpdatedAt: now - 500, speedUpdatedAt: now - 3100, now })).toBe(false)
    expect(isGpsSpeedShowable({ fixType: 3, fixUpdatedAt: now - 500, speedUpdatedAt: undefined, now })).toBe(false)
  })

  test('no GPS_RAW_INT for more than 3 s → not shown, as the fix it last reported may be gone', () => {
    expect(isGpsSpeedShowable({ fixType: 3, fixUpdatedAt: now - 3100, speedUpdatedAt: now - 500, now })).toBe(false)
    expect(isGpsSpeedShowable({ fixType: 3, fixUpdatedAt: undefined, speedUpdatedAt: now - 500, now })).toBe(false)
  })

  test('the GPS fix is read from the same vehicle as the speed', () => {
    expect(gpsFixVariableFor('VFR_HUD/groundspeed')).toBe('GPS_RAW_INT/fix_type')
    expect(gpsFixVariableFor('/mavlink/1/1/VFR_HUD/groundspeed')).toBe('/mavlink/1/1/GPS_RAW_INT/fix_type')
    expect(gpsFixVariableFor('GPS_RAW_INT/vel')).toBe('GPS_RAW_INT/fix_type')
  })

  test('the speed variables measured by GPS are recognised, others are not', () => {
    expect(isGpsSpeedVariable('VFR_HUD/groundspeed')).toBe(true)
    expect(isGpsSpeedVariable('/mavlink/1/1/VFR_HUD/groundspeed')).toBe(true)
    expect(isGpsSpeedVariable('GPS_RAW_INT/vel')).toBe(true)
    expect(isGpsSpeedVariable('VFR_HUD/airspeed')).toBe(false)
    expect(isGpsSpeedVariable('SYS_STATUS/voltage_battery')).toBe(false)
  })
})

// Branding task, item 3: the stored indicator options stay as they are, only what is shown is translated
describe('built-in indicator name and unit are shown in the interface language', () => {
  test('in Russian: «Скорость (GPS)», «м/с»', () => {
    expect(indicatorDisplayName('Speed (GPS)', translator(ru))).toBe('Скорость (GPS)')
    expect(indicatorDisplayUnit('m/s', translator(ru))).toBe('м/с')
  })

  test('in English: «Speed (GPS)», «m/s»', () => {
    expect(indicatorDisplayName('Speed (GPS)', translator(en))).toBe('Speed (GPS)')
    expect(indicatorDisplayUnit('m/s', translator(en))).toBe('m/s')
  })

  test('names and units the operator typed stay as typed', () => {
    expect(indicatorDisplayName('Напряжение', translator(ru))).toBe('Напряжение')
    expect(indicatorDisplayUnit('V', translator(ru))).toBe('V')
  })
})
