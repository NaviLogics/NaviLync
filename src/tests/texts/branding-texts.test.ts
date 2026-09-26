import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import en from '@/locales/en.json'
import ru from '@/locales/ru.json'

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')

const valuesWithPaths = (node: unknown, path = ''): [string, string][] =>
  typeof node === 'string'
    ? [[path, node]]
    : Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
        valuesWithPaths(value, path ? `${path}.${key}` : key)
      )
const ruText = Object.fromEntries(valuesWithPaths(ru))
const enText = Object.fromEntries(valuesWithPaths(en))

// Branding task, item 7: a surface vehicle does not fly. The table of these texts goes to the customer for approval.
const drivingTexts: Record<string, string> = {
  'menu.main.flight': 'Движение',
  'missionConfig.autoSwitchToFlightMode': 'Автоматически переходить в режим «Движение» после загрузки миссии',
  'missionPlanning.flightMode': 'Режим движения',
  'missionPlanning.switchToFlightMode': 'Перейти в режим «Движение»',
  'missionPlanning.alwaysSwitchToFlightMode': 'Всегда переходить в режим «Движение»',
  'missionPlanning.goToFlightModeMessage': 'Перейдите в режим «Движение» и нажмите кнопку «Старт» для запуска миссии.',
  'missionPlanning.autoSwitchFlightModeEnabled':
    'Теперь после загрузки миссии вы будете автоматически переходить в режим «Движение». Изменить это можно в настройках планирования миссий.',
}

describe('"Полёт" becomes "Движение" (branding, item 7)', () => {
  test.each(Object.entries(drivingTexts))('%s', (key, text) => {
    expect(ruText[key]).toBe(text)
  })

  test('no Russian text speaks of flight any more', () => {
    expect(valuesWithPaths(ru).filter(([, value]) => /полёт|полет/i.test(value))).toEqual([])
  })

  test('English is unchanged', () => {
    expect(enText['menu.main.flight']).toBe('Flight')
    expect(enText['missionPlanning.flightMode']).toBe('Flight mode')
  })

  test('the view button shows the driving icon, cleaned of the icon site comment and editor metadata', () => {
    expect(read('src/components/MainMenu.vue')).toMatch(
      /import DrivingIcon from '@\/assets\/icons\/mission-drive\.svg'/
    )
    const icon = read('src/assets/icons/mission-drive.svg')
    expect(icon).not.toMatch(/<!--|iconsvg|inkscape|sodipodi/i)
    expect(icon).toMatch(/<svg[\s>]/)
  })
})

describe('the texts are wired where they are shown (branding, items 3-5)', () => {
  test('the clock formats with the interface language', () => {
    expect(read('src/components/mini-widgets/Clock.vue')).toMatch(/formatClockDateTime\(/)
  })

  test('the generic indicator translates the built-in name and unit and hides a GPS speed without a fix', () => {
    const indicator = read('src/components/mini-widgets/VeryGenericIndicator.vue')
    expect(indicator).toMatch(/indicatorDisplayName\(/)
    expect(indicator).toMatch(/indicatorDisplayUnit\(/)
    expect(indicator).toMatch(/isGpsSpeedShowable\(/)
  })
})
