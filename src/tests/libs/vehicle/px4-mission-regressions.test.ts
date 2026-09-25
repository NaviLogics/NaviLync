import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Package } from '@/libs/connection/m2r/messages/mavlink2rest'
import {
  MavAutopilot,
  MavCmd,
  MavFrame,
  MAVLinkType,
  MavMissionResult,
  MavMissionType,
  MavModeFlag,
  MavState,
  MavType,
} from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import { ConnectionManager } from '@/libs/connection/connection-manager'
import { convertCockpitWaypointsToMavlink } from '@/libs/vehicle/mavlink/types'
import { PX4 } from '@/libs/vehicle/px4/px4'
import * as Vehicle from '@/libs/vehicle/vehicle'
import { VehicleFactory } from '@/libs/vehicle/vehicle-factory'
import { createFakePx4 } from '@/tests/fakes/fake-px4'
import { AltitudeReferenceType, MissionCommandType, type Waypoint } from '@/types/mission'

const encode = (pack: Package): Uint8Array => new TextEncoder().encode(JSON.stringify(pack))

const packageFromPx4 = (message: Package['message']): Package =>
  ({
    header: { system_id: 1, component_id: 1, sequence: 1 },
    message,
  } as Package)

const heartbeat = (mavtype: MavType, customMode = 0): Package =>
  packageFromPx4({
    type: MAVLinkType.HEARTBEAT,
    custom_mode: customMode,
    mavtype: { type: mavtype },
    autopilot: { type: MavAutopilot.MAV_AUTOPILOT_PX4 },
    base_mode: { bits: MavModeFlag.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED },
    system_status: { type: MavState.MAV_STATE_ACTIVE },
    mavlink_version: 3,
  } as unknown as Package['message'])

const waypointWithSpeedCommand = (): Waypoint => ({
  id: 'wp-1',
  coordinates: [55.75, 37.61],
  altitude: 0,
  altitudeReferenceType: AltitudeReferenceType.RELATIVE_TO_HOME,
  commands: [
    {
      type: MissionCommandType.MAVLINK_NON_NAV_COMMAND,
      command: MavCmd.MAV_CMD_DO_CHANGE_SPEED,
      param1: 1,
      param2: 2,
      param3: -1,
      param4: 0,
      x: 123,
      y: 456,
      z: 789,
    },
    {
      type: MissionCommandType.MAVLINK_NAV_COMMAND,
      command: MavCmd.MAV_CMD_NAV_WAYPOINT,
      param1: 0,
      param2: 2,
      param3: 0,
      param4: 0,
    },
  ],
})

const simpleWaypoint = (): Waypoint => ({
  id: 'wp',
  coordinates: [55.75, 37.61],
  altitude: 0,
  altitudeReferenceType: AltitudeReferenceType.RELATIVE_TO_HOME,
  commands: [
    {
      type: MissionCommandType.MAVLINK_NAV_COMMAND,
      command: MavCmd.MAV_CMD_NAV_WAYPOINT,
      param1: 0,
      param2: 2,
      param3: 0,
      param4: 0,
    },
  ],
})

describe('T0 PX4 mission safety regressions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    ConnectionManager.onWrite.clear()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('K3: NON_NAV uses MAV_FRAME_MISSION/zero coordinates while NAV keeps global frame/coordinates', () => {
    const [speed, nav] = convertCockpitWaypointsToMavlink([waypointWithSpeedCommand()], 1)

    expect(speed.command.type).toBe(MavCmd.MAV_CMD_DO_CHANGE_SPEED)
    expect(speed.frame.type).toBe(MavFrame.MAV_FRAME_MISSION)
    expect([speed.x, speed.y, speed.z]).toEqual([0, 0, 0])

    expect(nav.command.type).toBe(MavCmd.MAV_CMD_NAV_WAYPOINT)
    expect(nav.frame.type).toBe(MavFrame.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT)
    expect([nav.x, nav.y]).toEqual([557500000, 376100000])
  })

  test('V5: PX4 ground-rover heartbeat creates a Rover, not a Copter', () => {
    VehicleFactory._vehicles = []
    ConnectionManager.onRead.emit_value(encode(heartbeat(MavType.MAV_TYPE_GROUND_ROVER)))

    const vehicle = VehicleFactory.vehicles()[0]?.deref()
    expect(vehicle).toBeDefined()
    expect(vehicle?.type()).toBe(Vehicle.Type.Rover)
  })

  test('K2: PX4 AUTO/MISSION custom_mode is decoded as Mission mode', () => {
    const vehicle = new PX4(Vehicle.Type.Rover, 1)
    const autoMission = (4 << 16) | (4 << 24)

    vehicle.onIncomingMessage(encode(heartbeat(MavType.MAV_TYPE_GROUND_ROVER, autoMission)))

    expect(String(vehicle.mode())).toBe('Mission')
  })

  test('V4: startMission must not send MAV_CMD_MISSION_START when arming never becomes confirmed', async () => {
    const vehicle = new PX4(Vehicle.Type.Rover, 1)
    vi.spyOn(vehicle as unknown as { resetMode: () => Promise<void> }, 'resetMode').mockResolvedValue()
    vi.spyOn(vehicle, 'isArmed').mockReturnValue(false)
    vi.spyOn(vehicle, 'arm').mockResolvedValue()
    const sendCommand = vi.spyOn(vehicle, 'sendCommandLong').mockResolvedValue()

    const start = vehicle.startMission()
    const rejection = expect(start).rejects.toThrow(/arm/i)
    await vi.advanceTimersByTimeAsync(5200)

    await rejection
    expect(sendCommand).not.toHaveBeenCalledWith(MavCmd.MAV_CMD_MISSION_START, 0, 0)
  })

  test('K4: clearMissions stays pending until MISSION_ACK and rejects on negative ACK', async () => {
    const vehicle = new PX4(Vehicle.Type.Rover, 1)
    const clear = vehicle.clearMissions()
    let settled = false
    void clear.finally(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(100)
    expect(settled).toBe(false)

    vehicle.onIncomingMessage(
      encode(
        packageFromPx4({
          type: MAVLinkType.MISSION_ACK,
          target_system: 255,
          target_component: 240,
          mavtype: { type: MavMissionResult.MAV_MISSION_ERROR },
          mission_type: { type: MavMissionType.MAV_MISSION_TYPE_MISSION },
          opaque_id: 0,
        } as unknown as Package['message'])
      )
    )
    await expect(clear).rejects.toThrow()
  })

  test('T4: upload ignores MISSION_REQUEST_INT addressed to another GCS system', async () => {
    const vehicle = new PX4(Vehicle.Type.Rover, 1)
    const sent: Package[] = []
    const decoder = new TextDecoder()
    const capture = (bytes: Uint8Array): void => {
      sent.push(JSON.parse(decoder.decode(bytes) as Package))
    }
    ConnectionManager.onWrite.add(capture)

    const upload = vehicle.uploadMission([simpleWaypoint()], async () => undefined, 1000)
    await vi.advanceTimersByTimeAsync(2)

    const count = sent.find((pack) => pack.message.type === MAVLinkType.MISSION_COUNT)
    expect(count).toBeDefined()
    const ownGcsSystemId = count?.header.system_id
    const ownGcsComponentId = count?.header.component_id
    expect(ownGcsSystemId).toBeDefined()
    expect(ownGcsComponentId).toBeDefined()
    const foreignGcsSystemId = ownGcsSystemId === 1 ? 2 : 1
    const itemCountBeforeForeignRequest = sent.filter(
      (pack) => pack.message.type === MAVLinkType.MISSION_ITEM_INT
    ).length

    vehicle.onIncomingMessage(
      encode(
        packageFromPx4({
          type: MAVLinkType.MISSION_REQUEST_INT,
          target_system: foreignGcsSystemId,
          target_component: ownGcsComponentId,
          seq: 0,
          mission_type: { type: MavMissionType.MAV_MISSION_TYPE_MISSION },
        } as unknown as Package['message'])
      )
    )
    await vi.advanceTimersByTimeAsync(5)

    expect(sent.filter((pack) => pack.message.type === MAVLinkType.MISSION_ITEM_INT)).toHaveLength(
      itemCountBeforeForeignRequest
    )

    // Do not await the legacy upload transaction here: current production code does not
    // filter requests by GCS target and T0 must expose that defect without coupling this
    // regression to the legacy transaction's timeout/completion mechanics.
    void upload.catch(() => undefined)
  })

  test('fake PX4 retries the expected MISSION_REQUEST_INT every 250 ms', async () => {
    const fake = createFakePx4({ seed: 7 })
    const sent: Package[] = []
    fake.onSend((pack) => sent.push(pack))
    fake.receive({
      header: { system_id: 255, component_id: 190, sequence: 0 },
      message: {
        type: MAVLinkType.MISSION_COUNT,
        target_system: 1,
        target_component: 1,
        count: 1,
        mission_type: { type: MavMissionType.MAV_MISSION_TYPE_MISSION },
        opaque_id: 0,
      } as unknown as Package['message'],
    } as Package)

    await fake.advance(1)
    expect(sent.filter((pack) => pack.message.type === MAVLinkType.MISSION_REQUEST_INT)).toHaveLength(1)
    await fake.advance(250)
    expect(sent.filter((pack) => pack.message.type === MAVLinkType.MISSION_REQUEST_INT)).toHaveLength(2)
  })
})
