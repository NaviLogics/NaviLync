import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, expect, test, vi } from 'vitest'

import { MavAutopilot } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import type { useMainVehicleStore } from '@/stores/mainVehicle'

// The WASM MAVLink parser and the Vuetify-mounted dialogs cannot load under vitest and are not needed here.
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))
vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({ showDialog: vi.fn(), closeDialog: vi.fn() }),
}))
vi.mock('@/composables/usernamePrompDialog', () => ({ askForUsername: vi.fn() }))

let createMainVehicleStore: typeof useMainVehicleStore

beforeAll(async () => {
  // jsdom has no Gamepad API, and the joystick manager polls it as soon as the stores are imported.
  Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true })
  createMainVehicleStore = (await import('@/stores/mainVehicle')).useMainVehicleStore
})

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

// On the pilot the PX4 mode is changed on the RC transmitter or in QGC; NaviLync offers mode, mission start/pause,
// return and takeoff/land commands only when the autopilot is known to be ArduPilot.
test('mode commands are offered only once the autopilot is known to be ArduPilot', () => {
  const mainVehicleStore = createMainVehicleStore()
  expect(mainVehicleStore).toHaveProperty('canCommandModes', false)

  mainVehicleStore.firmwareType = MavAutopilot.MAV_AUTOPILOT_PX4
  expect(mainVehicleStore).toHaveProperty('canCommandModes', false)

  mainVehicleStore.firmwareType = MavAutopilot.MAV_AUTOPILOT_ARDUPILOTMEGA
  expect(mainVehicleStore).toHaveProperty('canCommandModes', true)
})
