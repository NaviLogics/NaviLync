import { beforeAll, describe, expect, test, vi } from 'vitest'

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

// The WASM MAVLink parser cannot load under vitest and is not needed to feed packets to the vehicle directly.
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))

let PX4Class: typeof PX4
let VehicleType: typeof import('@/libs/vehicle/vehicle').Type

// PX4 packs its mode into custom_mode as { reserved: uint16, main_mode: uint8, sub_mode: uint8 }.
const px4CustomMode = (mainMode: number, subMode: number): number => ((mainMode << 16) | (subMode << 24)) >>> 0

const heartbeat = (customMode: number, baseModeBits = MavModeFlag.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED): Uint8Array => {
  const message: Message.Heartbeat = {
    type: MAVLinkType.HEARTBEAT,
    custom_mode: customMode,
    mavtype: { type: MavType.MAV_TYPE_GROUND_ROVER },
    autopilot: { type: MavAutopilot.MAV_AUTOPILOT_PX4 },
    base_mode: { bits: baseModeBits },
    system_status: { type: MavState.MAV_STATE_ACTIVE },
    mavlink_version: 3,
  }
  const pack: Package = { header: { system_id: 1, component_id: 1, sequence: 0 }, message }
  return new TextEncoder().encode(JSON.stringify(pack))
}

describe('PX4 mode shown by NaviLync (K2, display only)', () => {
  beforeAll(async () => {
    PX4Class = (await import('@/libs/vehicle/px4/px4')).PX4
    VehicleType = (await import('@/libs/vehicle/vehicle')).Type
  })

  test.each([
    [1, 0, 'Manual'],
    [3, 0, 'Position'],
    [4, 4, 'Mission'],
    [4, 3, 'Hold'],
    [4, 5, 'Return'],
    [4, 9, 'Unknown(4/9)'],
    [5, 0, 'Unknown(5/0)'],
  ])('custom_mode main=%i sub=%i is shown as %s', (mainMode, subMode, expectedMode) => {
    const vehicle = new PX4Class(VehicleType.Rover, 1)
    const onMode = vi.fn()
    vehicle.onMode.add(onMode)

    vehicle.onIncomingMessage(heartbeat(px4CustomMode(mainMode, subMode)))

    expect(vehicle.mode()).toBe(expectedMode)
    expect(onMode).toHaveBeenLastCalledWith(expectedMode)
  })

  test('the known modes are the ones NaviLync can name', () => {
    const vehicle = new PX4Class(VehicleType.Rover, 1)

    expect([...vehicle.modesAvailable().keys()]).toEqual(['Manual', 'Position', 'Mission', 'Hold', 'Return'])
  })

  test('a heartbeat without a custom mode leaves the shown mode unchanged', () => {
    const vehicle = new PX4Class(VehicleType.Rover, 1)
    vehicle.onIncomingMessage(heartbeat(px4CustomMode(4, 4)))

    vehicle.onIncomingMessage(heartbeat(0, MavModeFlag.MAV_MODE_FLAG_SAFETY_ARMED))

    expect(vehicle.mode()).toBe('Mission')
  })

  test('NaviLync does not change the PX4 mode: setMode refuses and sends no command', async () => {
    const vehicle = new PX4Class(VehicleType.Rover, 1)
    const sendCommandLong = vi.spyOn(vehicle, 'sendCommandLong').mockResolvedValue()

    await expect(vehicle.setMode('Mission')).rejects.toThrow()
    expect(sendCommandLong).not.toHaveBeenCalled()
  })
})
