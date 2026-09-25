import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { toRaw } from 'vue'

import type { Package } from '@/libs/connection/m2r/messages/mavlink2rest'
import {
  MavAutopilot,
  MAVLinkType,
  MavModeFlag,
  MavState,
  MavType,
} from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import type { Message } from '@/libs/connection/m2r/messages/mavlink2rest-message'
import type { PX4 } from '@/libs/vehicle/px4/px4'
import type { VehicleFactory } from '@/libs/vehicle/vehicle-factory'
import type { useMainVehicleStore } from '@/stores/mainVehicle'
import type { useMissionStore } from '@/stores/mission'

// The WASM MAVLink parser and the Vuetify-mounted dialogs cannot load under vitest and are not needed here.
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))
vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({ showDialog: vi.fn(), closeDialog: vi.fn() }),
}))
vi.mock('@/composables/usernamePrompDialog', () => ({ askForUsername: vi.fn() }))
// Joystick forwarding and BlueOS services are not part of the mode display; stub them so they don't run against a PX4.
vi.mock('@/libs/joystick/protocols/mavlink-manual-control', async () => {
  const actual = await vi.importActual<typeof import('@/libs/joystick/protocols/mavlink-manual-control')>(
    '@/libs/joystick/protocols/mavlink-manual-control'
  )
  return {
    ...actual,
    MavlinkManualControlManager: class extends actual.MavlinkManualControlManager {
      /**
       *
       */
      setVehicle(): void {
        return
      }
    },
  }
})
vi.mock('@/libs/blueos', async () => ({
  ...(await vi.importActual<typeof import('@/libs/blueos')>('@/libs/blueos')),
  getKeyDataFromCockpitVehicleStorage: vi.fn(async () => {
    throw new Error('BlueOS is not available.')
  }),
  setKeyDataOnCockpitVehicleStorage: vi.fn(async () => undefined),
  getCpusInfo: vi.fn(() => new Promise(() => undefined)),
  getCpuTempCelsius: vi.fn(() => new Promise(() => undefined)),
  getNetworkInfo: vi.fn(() => new Promise(() => undefined)),
  getStatus: vi.fn(() => new Promise(() => undefined)),
  getVehicleName: vi.fn(() => new Promise(() => undefined)),
  getIpsInformationFromVehicle: vi.fn(() => new Promise(() => undefined)),
}))

let PX4Class: typeof PX4
let vehicleFactory: typeof VehicleFactory
let createMainVehicleStore: typeof useMainVehicleStore
let createMissionStore: typeof useMissionStore
let VehicleType: typeof import('@/libs/vehicle/vehicle').Type

const heartbeat = (mainMode: number, subMode: number): Uint8Array => {
  const message: Message.Heartbeat = {
    type: MAVLinkType.HEARTBEAT,
    custom_mode: ((mainMode << 16) | (subMode << 24)) >>> 0,
    mavtype: { type: MavType.MAV_TYPE_GROUND_ROVER },
    autopilot: { type: MavAutopilot.MAV_AUTOPILOT_PX4 },
    base_mode: { bits: MavModeFlag.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED },
    system_status: { type: MavState.MAV_STATE_ACTIVE },
    mavlink_version: 3,
  }
  const pack: Package = { header: { system_id: 1, component_id: 1, sequence: 0 }, message }
  return new TextEncoder().encode(JSON.stringify(pack))
}

const setupStoresWithPx4 = (): [PX4, ReturnType<typeof useMainVehicleStore>, ReturnType<typeof useMissionStore>] => {
  const mainVehicleStore = createMainVehicleStore()
  const missionStore = createMissionStore()
  const vehicle = new PX4Class(VehicleType.Rover, 1)
  vi.spyOn(vehicle, 'sendCommandLong').mockResolvedValue()
  vehicleFactory.onVehicles.emit_value([new WeakRef(vehicle)])
  expect(toRaw(mainVehicleStore.mainVehicle)).toBe(vehicle)
  return [vehicle, mainVehicleStore, missionStore]
}

describe('PX4 mode in the main vehicle and mission stores', () => {
  beforeAll(async () => {
    // jsdom has no Gamepad API, and the joystick manager polls it as soon as the stores are imported.
    Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true })
    PX4Class = (await import('@/libs/vehicle/px4/px4')).PX4
    vehicleFactory = (await import('@/libs/vehicle/vehicle-factory')).VehicleFactory
    createMainVehicleStore = (await import('@/stores/mainVehicle')).useMainVehicleStore
    createMissionStore = (await import('@/stores/mission')).useMissionStore
    VehicleType = (await import('@/libs/vehicle/vehicle')).Type
  })

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('shows AUTO.MISSION as Mission and counts it as a running mission', () => {
    const [vehicle, mainVehicleStore, missionStore] = setupStoresWithPx4()

    vehicle.onIncomingMessage(heartbeat(4, 4))

    expect(mainVehicleStore.mode).toBe('Mission')
    expect(missionStore.isMissionRunning).toBe(true)
  })

  test('shows AUTO.LOITER as Hold and does not count it as a running mission', () => {
    const [vehicle, mainVehicleStore, missionStore] = setupStoresWithPx4()

    vehicle.onIncomingMessage(heartbeat(4, 4))
    vehicle.onIncomingMessage(heartbeat(4, 3))

    expect(mainVehicleStore.mode).toBe('Hold')
    expect(missionStore.isMissionRunning).toBe(false)
  })

  test('shows a mode NaviLync cannot name instead of hiding it', () => {
    const [vehicle, mainVehicleStore] = setupStoresWithPx4()

    vehicle.onIncomingMessage(heartbeat(4, 9))

    expect(mainVehicleStore.mode).toBe('Unknown(4/9)')
  })
})
