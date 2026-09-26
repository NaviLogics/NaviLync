import { describe, expect, test } from 'vitest'

import { MavCmd, MavFrame } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import { convertCockpitWaypointsToMavlink, convertMavlinkWaypointsToCockpit } from '@/libs/vehicle/mavlink/types'
import { type Waypoint, AltitudeReferenceType, MissionCommandType } from '@/types/mission'

const systemId = 1

const waypointAt = (latitude: number, longitude: number): Waypoint => ({
  id: `${latitude},${longitude}`,
  coordinates: [latitude, longitude],
  altitude: 0,
  altitudeReferenceType: AltitudeReferenceType.RELATIVE_TO_HOME,
  commands: [
    {
      type: MissionCommandType.MAVLINK_NAV_COMMAND,
      command: MavCmd.MAV_CMD_NAV_WAYPOINT,
      param1: 0,
      param2: 5,
      param3: 0,
      param4: 0,
    },
  ],
})

describe('converting mission items between NaviLync and MAVLink (K3, P5)', () => {
  test('NON_NAV items go in MAV_FRAME_MISSION with x/y/z = 0, NAV items keep the frame and position of their WP', () => {
    const first = waypointAt(55.7512345, 37.6123456)
    first.altitudeReferenceType = AltitudeReferenceType.ABSOLUTE_RELATIVE_TO_MSL
    first.altitude = 12
    first.commands.push({
      type: MissionCommandType.MAVLINK_NON_NAV_COMMAND,
      command: MavCmd.MAV_CMD_DO_SET_SERVO,
      param1: 5,
      param2: 1500,
      param3: 0,
      param4: 0,
      x: 11,
      y: 22,
      z: 33,
    })

    const [nav, servo] = convertCockpitWaypointsToMavlink([first], systemId)

    expect(nav.command.type).toBe(MavCmd.MAV_CMD_NAV_WAYPOINT)
    expect(nav.frame.type).toBe(MavFrame.MAV_FRAME_GLOBAL_INT)
    expect([nav.x, nav.y, nav.z]).toEqual([557512345, 376123456, 12])
    expect(servo.command.type).toBe(MavCmd.MAV_CMD_DO_SET_SERVO)
    expect(servo.frame.type).toBe(MavFrame.MAV_FRAME_MISSION)
    expect([servo.x, servo.y, servo.z]).toEqual([0, 0, 0])
  })

  test('on download, a DO item before the first WP is kept on that WP, before its NAV item', () => {
    const speed = {
      type: MissionCommandType.MAVLINK_NON_NAV_COMMAND,
      command: MavCmd.MAV_CMD_DO_CHANGE_SPEED,
      param1: 1,
      param2: 2,
      param3: -1,
      param4: 0,
      x: 0,
      y: 0,
      z: 0,
    } as const
    const items = convertCockpitWaypointsToMavlink(
      [waypointAt(55.75, 37.61), waypointAt(55.76, 37.62)].map((wp, i) =>
        i === 0 ? { ...wp, commands: [speed, ...wp.commands] } : wp
      ),
      systemId
    )
    expect(items.map((item) => item.command.type)).toEqual([
      MavCmd.MAV_CMD_DO_CHANGE_SPEED,
      MavCmd.MAV_CMD_NAV_WAYPOINT,
      MavCmd.MAV_CMD_NAV_WAYPOINT,
    ])

    const waypoints = convertMavlinkWaypointsToCockpit(items)

    expect(waypoints).toHaveLength(2)
    expect(waypoints[0].commands).toEqual([speed, ...waypointAt(55.75, 37.61).commands])
  })
})
