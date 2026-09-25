import { describe, expect, test } from 'vitest'

import { MavCmd, MavFrame } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import { convertCockpitWaypointsToMavlink } from '@/libs/vehicle/mavlink/types'
import { AltitudeReferenceType, MissionCommandType, type Waypoint } from '@/types/mission'

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

describe('T0 PX4 mission safety regressions', () => {
  test('serializes NON_NAV commands in MAV_FRAME_MISSION with zero coordinates (K3)', () => {
    const [speed] = convertCockpitWaypointsToMavlink([waypointWithSpeedCommand()], 1)

    expect(speed.command.type).toBe(MavCmd.MAV_CMD_DO_CHANGE_SPEED)
    expect(speed.frame.type).toBe(MavFrame.MAV_FRAME_MISSION)
    expect([speed.x, speed.y, speed.z]).toEqual([0, 0, 0])
  })

  test.todo('maps a three-waypoint PX4 plan to MAVLink seq [0, 1, 2] (V1)')
  test.todo('resets a stopped PX4 mission to seq 0 (V1)')
  test.todo('keeps a one-waypoint PX4 mission executable (V1)')
  test.todo('creates PX4 ground rover heartbeat as a surface vehicle, not Copter (V5)')
  test.todo('decodes PX4 custom_mode main/sub modes used by NAVIS ATLAS (K2)')
  test.todo('does not send MISSION_START when arming is not confirmed (V4)')
  test.todo('fails mission clear when MISSION_ACK is not received (K4)')
  test.todo('ignores MISSION_REQUEST_INT addressed to another GCS (T4)')
})
