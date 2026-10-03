import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { Ref } from 'vue'

import { missionCheckMessages, missionCheckText } from '@/libs/mission/mission-check-text'
import { i18n } from '@/plugins/i18n'

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')
const setLocale = (locale: string): void => {
  ;(i18n.global.locale as unknown as Ref<string>).value = locale
}

// Review of #39
describe('mission check dialog texts', () => {
  afterEach(() => setLocale('ru'))

  test('numbers use a decimal comma in Russian and a point in English', () => {
    const warning = { kind: 'speedOverLimit', speed: 2.5, limit: 1.8 } as const
    setLocale('ru')
    expect(missionCheckText(warning)).toContain('2,5 м/с')
    expect(missionCheckText(warning)).toContain('1,8 м/с')
    expect(missionCheckText({ kind: 'invalidSpeed', speed: -0.5 })).toContain('-0,5')
    setLocale('en')
    expect(missionCheckText(warning)).toContain('2.5 m/s')
  })

  test('NAV_ACC_RAD wide for the lines: the side shift at the start of a line and the 1.0 m advice', () => {
    setLocale('ru')
    const text = missionCheckText({ kind: 'acceptanceRadiusWideForLines', radius: 2, spacing: 1.5 })
    expect(text).toContain('NAV_ACC_RAD = 2 м')
    expect(text).toContain('1,5 м')
    expect(text).toContain('боковое смещение на входе в галс до 2 м')
    expect(text).toContain('1,0 м')
  })

  test('without the vehicle parameters the dialog says the speed check was not done, even with no other warning', () => {
    setLocale('ru')
    expect(missionCheckMessages([], {})).toEqual(['Параметры аппарата не получены, проверка скорости не выполнена.'])
    expect(missionCheckMessages([], { speedLimit: 2 })).toHaveLength(1)
    expect(missionCheckMessages([], { speedLimit: 2, acceptanceRadius: 2 })).toEqual([])
  })

  test('the planner asks before the upload whenever there is a line to show', () => {
    const planner = read('src/views/MissionPlanningView.vue')
    expect(planner).toMatch(/missionCheckMessages\(/)
    expect(planner).not.toMatch(/const formatNumber =/)
  })
})
