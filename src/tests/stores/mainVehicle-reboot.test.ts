import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import { MavCmd, MAVLinkType } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import type { ArduRover } from '@/libs/vehicle/ardupilot/ardurover'
import { isBlockedAutopilotReboot } from '@/libs/vehicle/autopilot-reboot'
import type { VehicleFactory } from '@/libs/vehicle/vehicle-factory'
import type { useMainVehicleStore } from '@/stores/mainVehicle'

// The WASM MAVLink parser and the Vuetify-mounted dialogs cannot load under vitest and are not needed here.
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))
vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({ showDialog: vi.fn(), closeDialog: vi.fn() }),
}))
vi.mock('@/composables/usernamePrompDialog', () => ({ askForUsername: vi.fn() }))

let ArduRoverClass: typeof ArduRover
let vehicleFactory: typeof VehicleFactory
let createMainVehicleStore: typeof useMainVehicleStore

const reboot = {
  type: MAVLinkType.COMMAND_LONG,
  command: { type: MavCmd.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN },
  param1: 1,
}

// Release 1.0, task 5
describe('main vehicle store: autopilot reboot', () => {
  beforeAll(async () => {
    // jsdom has no Gamepad API, and the joystick manager polls it as soon as the stores are imported.
    Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true })
    ArduRoverClass = (await import('@/libs/vehicle/ardupilot/ardurover')).ArduRover
    vehicleFactory = (await import('@/libs/vehicle/vehicle-factory')).VehicleFactory
    createMainVehicleStore = (await import('@/stores/mainVehicle')).useMainVehicleStore
  })

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const setup = (): [ArduRover, ReturnType<typeof useMainVehicleStore>] => {
    const store = createMainVehicleStore()
    const vehicle = new ArduRoverClass(1)
    vehicleFactory.onVehicles.emit_value([new WeakRef(vehicle)])
    return [vehicle, store]
  }

  test('armed: the reboot is refused and no command goes out', async () => {
    const [vehicle, store] = setup()
    const send = vi.spyOn(vehicle, 'sendCommandLong').mockResolvedValue(undefined)
    vehicle.onArm.emit_value(true)

    await expect(store.rebootAutopilot()).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
    expect(isBlockedAutopilotReboot(reboot)).toBe(true)
  })

  test('disarmed: MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN with param1 1 (reboot autopilot) is sent', async () => {
    const [vehicle, store] = setup()
    const send = vi.spyOn(vehicle, 'sendCommandLong').mockResolvedValue(undefined)
    vehicle.onArm.emit_value(false)

    await store.rebootAutopilot()
    expect(send).toHaveBeenCalledWith(MavCmd.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN, 1)
    expect(isBlockedAutopilotReboot(reboot)).toBe(false)
  })
})
