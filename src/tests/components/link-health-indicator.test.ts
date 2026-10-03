import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { reactive } from 'vue'

import type { LinkHealth, LinkOutage, SessionEvent } from '@/libs/link-health'
import { i18n } from '@/plugins/i18n'

const store = reactive({
  isVehicleOnline: true,
  linkHealthState: 'ok' as LinkHealth,
  heartbeatAgeMs: 500 as number | undefined,
  linkOutages: [] as LinkOutage[],
  sessionEvents: [] as SessionEvent[],
})
vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => store }))

import BaseCommIndicator from '@/components/mini-widgets/BaseCommIndicator.vue'

// Vuetify overlays render their activator and their content in place here
const Overlay = { template: '<div><slot name="activator" :props="{}" /><slot /></div>' }
const render = (): ReturnType<typeof mount> =>
  mount(BaseCommIndicator, {
    global: {
      plugins: [i18n],
      stubs: { 'v-tooltip': Overlay, 'v-menu': Overlay, 'FontAwesomeIcon': true },
    },
  })

// Release 1.0, task 8
describe('link indicator in the header', () => {
  test.each([
    ['ok', 'link-ok'],
    ['degraded', 'link-degraded'],
    ['lost', 'link-lost'],
  ] as [LinkHealth, string][])('%s → %s', (state, cssClass) => {
    store.linkHealthState = state
    const wrapper = render()
    expect(wrapper.find(`.${cssClass}`).exists()).toBe(true)
  })

  test('the journal lists each loss: start, length, mode and arming', () => {
    store.linkOutages = [
      {
        startedAt: new Date(2026, 9, 1, 14, 3, 7).getTime(),
        durationMs: 615_000,
        ended: true,
        context: { mode: 'Mission', armed: true },
      },
    ]
    const wrapper = render()
    const entry = wrapper.find('.link-outage').text()
    expect(entry).toContain('14:03:07')
    expect(entry).toContain('615')
    expect(entry).toContain('Mission')
    expect(entry).toContain(i18n.global.t('linkHealth.armed'))
  })

  // Release 1.0, task 11
  test('the journal lists the onboard computer shutdown: time, what happened and how it was told', () => {
    store.sessionEvents = [
      {
        at: new Date(2026, 9, 3, 18, 40, 5).getTime(),
        kind: 'onboardShutdown',
        stage: 'commandSent',
        detection: 'ping',
      },
      { at: new Date(2026, 9, 3, 18, 40, 22).getTime(), kind: 'onboardShutdown', stage: 'off', detection: 'ping' },
    ]
    const wrapper = render()
    const entries = wrapper.findAll('.session-event').map((entry) => entry.text())

    const detection = i18n.global.t('onboardShutdown.detection.ping')
    expect(entries).toHaveLength(2)
    expect(entries[0]).toContain('18:40:22')
    expect(entries[0]).toContain(i18n.global.t('onboardShutdown.journal.off', { detection }))
    expect(entries[1]).toContain('18:40:05')
    expect(entries[1]).toContain(i18n.global.t('onboardShutdown.journal.commandSent', { detection }))
  })

  test('the store keeps the state and the journal from the HEARTBEAT of the autopilot', () => {
    const source = readFileSync(join(process.cwd(), 'src/stores/mainVehicle.ts'), 'utf8')
    expect(source).toMatch(/new LinkOutageJournal\(\)/)
    expect(source).toMatch(/linkHealth\(heartbeatAgeMs\.value\)/)
    expect(source).toMatch(/sessionEvents\.push\(\{ \.\.\.event, at: Date\.now\(\) \}\)/)
  })
})
