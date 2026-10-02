import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { reactive } from 'vue'

import type { useMissionStore } from '@/stores/mission'

const timeout = new Error("No acknowledgment received for command 'MAV_CMD_MISSION_START' before timeout (5s).")
const vehicleStore = reactive({
  isVehicleOnline: true,
  mode: 'Hold',
  currentMissionSeq: 1 as number | undefined,
  startMission: vi.fn(async () => Promise.reject(timeout)),
  pauseMission: vi.fn(async () => Promise.reject(timeout)),
  setMissionCurrent: vi.fn(async () => Promise.reject(timeout)),
})
const openSnackbar = vi.fn()

vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => vehicleStore }))
vi.mock('@/composables/snackbar', () => ({ openSnackbar: (...args: unknown[]) => openSnackbar(...args) }))
vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({ showDialog: vi.fn(), closeDialog: vi.fn() }),
}))
vi.mock('@/composables/usernamePrompDialog', () => ({ askForUsername: vi.fn() }))

let createMissionStore: typeof useMissionStore

// Release 1.0, task 8: a command that timed out must not look like it worked
describe('mission commands that fail are shown to the operator', () => {
  beforeAll(async () => {
    createMissionStore = (await import('@/stores/mission')).useMissionStore
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    openSnackbar.mockClear()
  })

  const shownErrors = (): string[] =>
    openSnackbar.mock.calls
      .map(([options]) => options)
      .filter((o) => o.variant === 'error')
      .map((o) => o.message)

  test('starting the mission', async () => {
    const store = createMissionStore()
    expect(await store.executeMissionOnVehicle()).toBe(false)
    expect(shownErrors().some((message) => message.includes('MAV_CMD_MISSION_START'))).toBe(true)
  })

  test('stopping the mission', async () => {
    const store = createMissionStore()
    expect(await store.stopMission()).toBe(false)
    expect(shownErrors()).toHaveLength(1)
  })
})
