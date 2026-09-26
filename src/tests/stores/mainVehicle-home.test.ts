import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { toRaw } from 'vue'

import type { Package } from '@/libs/connection/m2r/messages/mavlink2rest'
import { MavCmd, MAVLinkType } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import type { Message } from '@/libs/connection/m2r/messages/mavlink2rest-message'
import type { PX4 } from '@/libs/vehicle/px4/px4'
import type { VehicleFactory } from '@/libs/vehicle/vehicle-factory'
import type { useMainVehicleStore } from '@/stores/mainVehicle'

// The WASM MAVLink parser and the Vuetify-mounted dialogs cannot load under vitest and are not needed here.
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))
vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({ showDialog: vi.fn(), closeDialog: vi.fn() }),
}))
vi.mock('@/composables/usernamePrompDialog', () => ({ askForUsername: vi.fn() }))
// Joystick forwarding and BlueOS services are not part of HOME handling; stub them so they don't run against a PX4.
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

const HOME_POSITION_MESSAGE_ID = 242

let PX4Class: typeof PX4
let vehicleFactory: typeof VehicleFactory
let createMainVehicleStore: typeof useMainVehicleStore
let VehicleType: typeof import('@/libs/vehicle/vehicle').Type

const homePositionPackage = (latitude: number, longitude: number, componentId = 1, altitudeMm = 0): Package => {
  const message: Message.HomePosition = {
    type: MAVLinkType.HOME_POSITION,
    latitude: Math.round(latitude * 1e7),
    longitude: Math.round(longitude * 1e7),
    altitude: altitudeMm,
    x: 0,
    y: 0,
    z: 0,
    q: [1, 0, 0, 0],
    approach_x: 0,
    approach_y: 0,
    approach_z: 0,
    time_usec: 0,
  }
  return { header: { system_id: 1, component_id: componentId, sequence: 0 }, message }
}

const setupStoreWithPx4 = (): [PX4, ReturnType<typeof useMainVehicleStore>] => {
  const mainVehicleStore = createMainVehicleStore()
  const vehicle = new PX4Class(VehicleType.Rover, 1)
  vi.spyOn(vehicle, 'sendCommandLong').mockResolvedValue()
  vi.spyOn(vehicle, 'setHomeWaypoint').mockResolvedValue()
  vehicleFactory.onVehicles.emit_value([new WeakRef(vehicle)])
  expect(toRaw(mainVehicleStore.mainVehicle)).toBe(vehicle)
  return [vehicle, mainVehicleStore]
}

describe('main vehicle store HOME (K1)', () => {
  beforeAll(async () => {
    // jsdom has no Gamepad API, and the joystick manager polls it as soon as the stores are imported.
    Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true })
    PX4Class = (await import('@/libs/vehicle/px4/px4')).PX4
    vehicleFactory = (await import('@/libs/vehicle/vehicle-factory')).VehicleFactory
    createMainVehicleStore = (await import('@/stores/mainVehicle')).useMainVehicleStore
    VehicleType = (await import('@/libs/vehicle/vehicle')).Type
  })

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('requests HOME_POSITION from the vehicle when it connects', () => {
    const [vehicle] = setupStoreWithPx4()

    expect(vehicle.sendCommandLong).toHaveBeenCalledWith(MavCmd.MAV_CMD_REQUEST_MESSAGE, HOME_POSITION_MESSAGE_ID)
    expect(vehicle.setHomeWaypoint).not.toHaveBeenCalled()
  })

  test('takes HOME only from HOME_POSITION sent by the autopilot', () => {
    const [vehicle, mainVehicleStore] = setupStoreWithPx4()
    expect(mainVehicleStore.homePosition).toBeUndefined()

    vehicle.onIncomingMAVLinkMessage.emit_value(MAVLinkType.HOME_POSITION, homePositionPackage(55.75, 37.61, 1, 12_500))
    expect(mainVehicleStore.homePosition?.latitude).toBeCloseTo(55.75, 7)
    expect(mainVehicleStore.homePosition?.longitude).toBeCloseTo(37.61, 7)
    // HOME_POSITION.altitude is in millimetres above mean sea level
    expect(mainVehicleStore.homePosition?.altitude).toBeCloseTo(12.5, 3)

    vehicle.onIncomingMAVLinkMessage.emit_value(MAVLinkType.HOME_POSITION, homePositionPackage(10, 20, 190))
    expect(mainVehicleStore.homePosition?.latitude).toBeCloseTo(55.75, 7)
    expect(mainVehicleStore.homePosition?.longitude).toBeCloseTo(37.61, 7)
  })

  test('setHomeWaypoint succeeds only once the vehicle reports the new HOME', async () => {
    const [vehicle, mainVehicleStore] = setupStoreWithPx4()
    vehicle.onIncomingMAVLinkMessage.emit_value(MAVLinkType.HOME_POSITION, homePositionPackage(55.75, 37.61))

    let settled = false
    const setHome = mainVehicleStore.setHomeWaypoint([55.76, 37.62], 0).finally(() => (settled = true))
    for (let i = 0; i < 10; i += 1) await Promise.resolve()

    expect(vehicle.setHomeWaypoint).toHaveBeenCalledWith([55.76, 37.62], 0)
    expect(settled).toBe(false)

    vehicle.onIncomingMAVLinkMessage.emit_value(MAVLinkType.HOME_POSITION, homePositionPackage(55.76, 37.62))
    await expect(setHome).resolves.toBeUndefined()
  })

  test('setHomeWaypoint fails when the vehicle never reports the new HOME', async () => {
    const [vehicle, mainVehicleStore] = setupStoreWithPx4()
    vehicle.onIncomingMAVLinkMessage.emit_value(MAVLinkType.HOME_POSITION, homePositionPackage(55.75, 37.61))
    vi.useFakeTimers()

    const setHome = mainVehicleStore.setHomeWaypoint([55.76, 37.62], 0)
    const rejection = expect(setHome).rejects.toThrow()
    for (let i = 0; i < 5; i += 1) await Promise.resolve()
    vi.advanceTimersByTime(10_000)

    await rejection
    expect(mainVehicleStore.homePosition?.latitude).toBeCloseTo(55.75, 7)
  })
})
