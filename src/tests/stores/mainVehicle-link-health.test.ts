import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'

import type { useMainVehicleStore } from '@/stores/mainVehicle'

// The WASM MAVLink parser and the Vuetify-mounted dialogs cannot load under vitest and are not needed here.
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))
vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({ showDialog: vi.fn(), closeDialog: vi.fn() }),
}))
vi.mock('@/composables/usernamePrompDialog', () => ({ askForUsername: vi.fn() }))

let createMainVehicleStore: typeof useMainVehicleStore

// Review of #38: the store, not only the lib, turns a silent autopilot into a red indicator and a journal entry
describe('main vehicle store: link state from the autopilot HEARTBEAT', () => {
  beforeAll(async () => {
    // jsdom has no Gamepad API, and the joystick manager polls it as soon as the stores are imported.
    Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true })
    createMainVehicleStore = (await import('@/stores/mainVehicle')).useMainVehicleStore
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    // jsdom rejects the CustomEvent the store dispatches on going offline; the app runs it in Chromium
    vi.spyOn(globalThis, 'dispatchEvent').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // The store updates the journal in a watcher, which Vue runs after the current tick
  const advance = async (ms: number): Promise<void> => {
    vi.advanceTimersByTime(ms)
    await nextTick()
  }

  test('a HEARTBEAT, then 3 s of silence: yellow; 6 s: red and an entry with the mode and arming', async () => {
    const store = createMainVehicleStore()
    store.mode = 'Mission'
    store.isArmed = true
    store.lastHeartbeat = new Date()
    await advance(500)
    expect(store.linkHealthState).toBe('ok')

    await advance(2500)
    expect(store.linkHealthState).toBe('degraded')
    expect(store.linkOutages).toHaveLength(0)

    await advance(3000)
    expect(store.linkHealthState).toBe('lost')
    expect(store.linkOutages).toHaveLength(1)
    expect(store.linkOutages[0]).toMatchObject({ ended: false, context: { mode: 'Mission', armed: true } })
  })

  test('HEARTBEATs back: the entry ends', async () => {
    const store = createMainVehicleStore()
    store.lastHeartbeat = new Date()
    await advance(8000)
    store.lastHeartbeat = new Date()
    await advance(200)

    expect(store.linkHealthState).toBe('ok')
    expect(store.linkOutages[0]).toMatchObject({ ended: true })
    expect(store.linkOutages[0].durationMs).toBeGreaterThanOrEqual(8000)
  })
})

// Review of #38: a mission transfer that times out must stay on screen until the operator closes it
describe('mission transfer failures in the planner', () => {
  const planner = readFileSync(join(process.cwd(), 'src/views/MissionPlanningView.vue'), 'utf8')
  const failureDialog = (titleKey: string): string => {
    const at = planner.indexOf(`t('missionPlanning.${titleKey}')`)
    return planner.slice(planner.lastIndexOf('showDialog({', at), planner.indexOf('})', at))
  }

  test.each(['missionUploadFailed', 'missionDownloadFailed'])('%s: no auto-close, timeout explained', (key) => {
    const dialog = failureDialog(key)
    expect(dialog).not.toMatch(/timer:/)
    expect(dialog).toMatch(/missionTransferErrorText\(/)
  })
})
