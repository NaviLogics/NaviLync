import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
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

// Bench, run 56: texts the operator sees (NaviLync starts in Russian)
describe('operator texts (bench)', () => {
  test('after an upload to PX4 the mission is started with the Mission switch (CH5), not a "Start" button', () => {
    expect(ruText['missionPlanning.startMissionWithRcSwitch']).toBe(
      'Запустите миссию переключателем Mission (CH5) на пульте'
    )
    expect(enText['missionPlanning.startMissionWithRcSwitch']).toContain('CH5')
    expect(read('src/views/MissionPlanningView.vue')).toMatch(
      /isPx4\s*\?\s*t\('missionPlanning\.startMissionWithRcSwitch'\)\s*:\s*t\('missionPlanning\.goToFlightModeMessage'\)/
    )
  })

  test('a mission being downloaded says "Скачивание", not "Загрузка" (which is the upload)', () => {
    expect(ruText['widgetConfig.map.loadingMission']).toBe('Скачивание миссии...')
    expect(ruText['missionPlanning.loadingMission']).toBe('Скачивание миссии...')
    expect(enText['widgetConfig.map.loadingMission']).toBe('Downloading mission...')
    expect(enText['missionPlanning.loadingMission']).toBe('Downloading mission...')
  })

  test('the start alert says NaviLync', async () => {
    setActivePinia(createPinia())
    const { useAlertStore } = await import('@/stores/alert')

    expect(useAlertStore().alerts[0].message).toBe('NaviLync запущен')
    expect(enText['alerts.navilyncStarted']).toBe('NaviLync started')
  })

  test('no operator text calls the application Cockpit, except the credits to the upstream project', () => {
    const upstreamCredits = ['about.upstream', 'about.attribution', 'about.credit', 'about.license']
    for (const locale of [en, ru]) {
      const offenders = valuesWithPaths(locale).filter(
        ([path, value]) => value.includes('Cockpit') && !upstreamCredits.includes(path)
      )
      expect(offenders).toEqual([])
    }

    const hardcoded = [
      ['src/stores/alert.ts', 'Cockpit started'],
      ['src/stores/video.ts', 'Cockpit Lite'],
      ['src/stores/video.ts', 'Cockpit Standalone'],
      ['src/stores/video.ts', "Cockpit's video service"],
      ['src/stores/video.ts', 'Restart Cockpit'],
      ['src/stores/video.ts', 'which Cockpit cannot play'],
      ['src/stores/video.ts', 'Cockpit cannot find the file'],
      ['src/utils/migrations.ts', 'Cockpit no longer keeps'],
      ['src/components/VideoLibraryModal.vue', "'Cockpit video'"],
    ].filter(([file, text]) => read(file).includes(text))
    expect(hardcoded).toEqual([])
  })
})
