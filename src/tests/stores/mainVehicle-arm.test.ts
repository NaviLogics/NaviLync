import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { toRaw } from 'vue'

import type { ArduRover } from '@/libs/vehicle/ardupilot/ardurover'
import type { VehicleFactory } from '@/libs/vehicle/vehicle-factory'
import type { useMainVehicleStore } from '@/stores/mainVehicle'
import type { useMissionStore } from '@/stores/mission'

// The WASM MAVLink parser and the Vuetify-mounted dialogs cannot load under vitest and are not needed to drive onArm.
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))
vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({ showDialog: vi.fn(), closeDialog: vi.fn() }),
}))
vi.mock('@/composables/usernamePrompDialog', () => ({ askForUsername: vi.fn() }))
// Simulates a vehicle without BlueOS: the vehicle ID cannot be read, so a new one has to be generated.
vi.mock('@/libs/blueos', async () => ({
  ...(await vi.importActual<typeof import('@/libs/blueos')>('@/libs/blueos')),
  getKeyDataFromCockpitVehicleStorage: vi.fn(async () => {
    throw new Error('BlueOS is not available.')
  }),
  setKeyDataOnCockpitVehicleStorage: vi.fn(async () => undefined),
}))

let ArduRoverClass: typeof ArduRover
let vehicleFactory: typeof VehicleFactory
let createMainVehicleStore: typeof useMainVehicleStore
let createMissionStore: typeof useMissionStore

const setupStoresWithVehicle = (): [
  ArduRover,
  ReturnType<typeof useMainVehicleStore>,
  ReturnType<typeof useMissionStore>
] => {
  const mainVehicleStore = createMainVehicleStore()
  const missionStore = createMissionStore()
  const vehicle = new ArduRoverClass(1)
  vehicleFactory.onVehicles.emit_value([new WeakRef(vehicle)])
  expect(toRaw(mainVehicleStore.mainVehicle)).toBe(vehicle)
  return [vehicle, mainVehicleStore, missionStore]
}

describe('main vehicle store vehicle callbacks', () => {
  beforeAll(async () => {
    // jsdom has no Gamepad API, and the joystick manager polls it as soon as the stores are imported.
    Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true })
    ArduRoverClass = (await import('@/libs/vehicle/ardupilot/ardurover')).ArduRover
    vehicleFactory = (await import('@/libs/vehicle/vehicle-factory')).VehicleFactory
    createMainVehicleStore = (await import('@/stores/mainVehicle')).useMainVehicleStore
    createMissionStore = (await import('@/stores/mission')).useMissionStore
  })

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('generates a vehicle ID when the vehicle has none stored', async () => {
    const [, mainVehicleStore] = setupStoresWithVehicle()

    for (let i = 0; i < 20 && mainVehicleStore.currentlyConnectedVehicleId === undefined; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    expect(mainVehicleStore.currentlyConnectedVehicleId).toMatch(/^[0-9a-f-]{36}$/)
    expect(localStorage.getItem('cockpit-last-connected-vehicle-id')).toBe(mainVehicleStore.currentlyConnectedVehicleId)
  })

  test('handles arm and disarm transitions without throwing', async () => {
    const [vehicle, mainVehicleStore] = setupStoresWithVehicle()

    expect(() => vehicle.onArm.emit_value(false)).not.toThrow()
    expect(() => vehicle.onArm.emit_value(true)).not.toThrow()
    expect(mainVehicleStore.isArmed).toBe(true)
    expect(() => vehicle.onArm.emit_value(false)).not.toThrow()
    expect(mainVehicleStore.isArmed).toBe(false)
  })

  test('keeps notifying later onArm listeners on a transition', async () => {
    const [vehicle] = setupStoresWithVehicle()
    const laterListener = vi.fn()
    vehicle.onArm.add(laterListener)

    vehicle.onArm.emit_value(false)
    vehicle.onArm.emit_value(true)

    expect(laterListener).toHaveBeenLastCalledWith(true)
    expect(laterListener).toHaveBeenCalledTimes(2)
  })

  test('clears the vehicle trail on a transition when position history is not persistent', async () => {
    const [vehicle, , missionStore] = setupStoresWithVehicle()
    missionStore.isVehiclePositionHistoryPersistent = false
    const clearVehicleHistory = vi.spyOn(missionStore, 'clearVehicleHistory')

    vehicle.onArm.emit_value(false)
    expect(clearVehicleHistory).not.toHaveBeenCalled()

    vehicle.onArm.emit_value(true)
    expect(clearVehicleHistory).toHaveBeenCalledOnce()
  })

  test('keeps the vehicle trail on a transition when position history is persistent', async () => {
    const [vehicle, , missionStore] = setupStoresWithVehicle()
    missionStore.isVehiclePositionHistoryPersistent = true
    const clearVehicleHistory = vi.spyOn(missionStore, 'clearVehicleHistory')

    vehicle.onArm.emit_value(false)
    vehicle.onArm.emit_value(true)

    expect(clearVehicleHistory).not.toHaveBeenCalled()
  })
})
