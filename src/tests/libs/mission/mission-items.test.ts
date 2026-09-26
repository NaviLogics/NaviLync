import { describe, expect, test } from 'vitest'

import { MavCmd, MavFrame } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import { extractCruiseSpeed, makeDefaultNavCommands, withCruiseSpeed } from '@/libs/mission/mission-items'
import { convertCockpitWaypointsToMavlink, convertMavlinkWaypointsToCockpit } from '@/libs/vehicle/mavlink/types'
import { type Waypoint, AltitudeReferenceType, MissionCommandType } from '@/types/mission'

const systemId = 1

const waypoint = (
  latitude: number,
  longitude: number,
  altitudeReferenceType = AltitudeReferenceType.RELATIVE_TO_HOME
): Waypoint => ({
  id: `${latitude},${longitude}`,
  coordinates: [latitude, longitude],
  altitude: 0,
  altitudeReferenceType,
  commands: makeDefaultNavCommands(),
})

const line = (count: number): Waypoint[] =>
  Array.from({ length: count }, (_, i) => waypoint(55.7512345 + i * 0.0001234, 37.6123456 + i * 0.0000567))

// A survey-like lawnmower pattern: rows in alternating directions joined by turn points
const lawnmower = (rows: number, pointsPerRow: number): Waypoint[] => {
  const waypoints: Waypoint[] = []
  for (let row = 0; row < rows; row += 1) {
    const latitude = 55.7500001 + row * 0.0002003
    const columns = Array.from({ length: pointsPerRow }, (_, i) => 37.6000001 + i * 0.0003007)
    if (row % 2 === 1) columns.reverse()
    columns.forEach((longitude) => waypoints.push(waypoint(latitude, longitude)))
    waypoints.push(waypoint(latitude + 0.0001001, columns[columns.length - 1]))
  }
  return waypoints
}

const withoutIds = (waypoints: Waypoint[]): Omit<Waypoint, 'id' | 'coordinates'>[] =>
  waypoints.map(({ altitude, altitudeReferenceType, commands }) => ({ altitude, altitudeReferenceType, commands }))

// Plan → what NaviLync uploads → what the vehicle hands back on download → plan
const roundTrip = (
  plan: Waypoint[],
  cruiseSpeed: number
): {
  /** The plan rebuilt from the mission the vehicle holds */
  waypoints: Waypoint[]
  /** The cruise speed rebuilt from the mission the vehicle holds */
  cruiseSpeed: number
} => {
  const uploaded = convertCockpitWaypointsToMavlink(withCruiseSpeed(plan, cruiseSpeed), systemId)
  const downloaded = JSON.parse(JSON.stringify(uploaded))
  return extractCruiseSpeed(convertMavlinkWaypointsToCockpit(downloaded))
}

const expectSamePlan = (actual: Waypoint[], expected: Waypoint[]): void => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((wp, i) => {
    expect(Math.abs(wp.coordinates[0] - expected[i].coordinates[0])).toBeLessThan(1e-7)
    expect(Math.abs(wp.coordinates[1] - expected[i].coordinates[1])).toBeLessThan(1e-7)
  })
  expect(withoutIds(actual)).toEqual(withoutIds(expected))
}

describe('mission item serialization for PX4 (K3, P5)', () => {
  test('a cruise speed other than 1 m/s becomes seq 0: DO_CHANGE_SPEED (ground speed) as a NON_NAV item', () => {
    const plan = line(3)

    const items = convertCockpitWaypointsToMavlink(withCruiseSpeed(plan, 2), systemId)

    expect(items.map((item) => item.command.type)).toEqual([
      MavCmd.MAV_CMD_DO_CHANGE_SPEED,
      MavCmd.MAV_CMD_NAV_WAYPOINT,
      MavCmd.MAV_CMD_NAV_WAYPOINT,
      MavCmd.MAV_CMD_NAV_WAYPOINT,
    ])
    expect(items.map((item) => item.seq)).toEqual([0, 1, 2, 3])
    const [speed] = items
    expect(speed.frame.type).toBe(MavFrame.MAV_FRAME_MISSION)
    expect([speed.x, speed.y, speed.z]).toEqual([0, 0, 0])
    expect([speed.param1, speed.param2, speed.param3, speed.param4]).toEqual([1, 2, -1, 0])
    expect(plan[0].commands).toHaveLength(1)
  })

  test('the cruise speed replaces a speed command the plan already carries instead of adding a second one', () => {
    const plan = withCruiseSpeed(line(2), 3)

    const speeds = withCruiseSpeed(plan, 2)[0].commands.filter((c) => c.command === MavCmd.MAV_CMD_DO_CHANGE_SPEED)

    expect(speeds).toHaveLength(1)
    expect(speeds[0].param2).toBe(2)
  })

  test('at 1 m/s no speed item is sent', () => {
    const items = convertCockpitWaypointsToMavlink(withCruiseSpeed(line(2), 1), systemId)

    expect(items.map((item) => item.command.type)).toEqual([MavCmd.MAV_CMD_NAV_WAYPOINT, MavCmd.MAV_CMD_NAV_WAYPOINT])
  })

  test('on download, the speed item is restored as the cruise speed of the mission', () => {
    const items = convertCockpitWaypointsToMavlink(withCruiseSpeed(line(2), 2.5), systemId)

    const { waypoints, cruiseSpeed } = extractCruiseSpeed(convertMavlinkWaypointsToCockpit(items))

    expect(cruiseSpeed).toBe(2.5)
    expect(waypoints[0].commands.map((c) => c.command)).toEqual([MavCmd.MAV_CMD_NAV_WAYPOINT])
  })

  test('a mission without a speed item downloads with the 1 m/s cruise speed that uploads without one', () => {
    const { cruiseSpeed } = extractCruiseSpeed(
      convertMavlinkWaypointsToCockpit(convertCockpitWaypointsToMavlink(line(2), 1))
    )

    expect(cruiseSpeed).toBe(1)
  })

  test('the speed item of missions uploaded by older NaviLync, right after the first WP, is restored as well', () => {
    const [first, second] = line(2)
    first.commands.push({
      type: MissionCommandType.MAVLINK_NAV_COMMAND,
      command: MavCmd.MAV_CMD_DO_CHANGE_SPEED,
      param1: 1,
      param2: 1.8,
      param3: -1,
      param4: 0,
    })
    const legacyItems = convertCockpitWaypointsToMavlink([first, second], systemId)

    const { waypoints, cruiseSpeed } = extractCruiseSpeed(convertMavlinkWaypointsToCockpit(legacyItems))

    expect(cruiseSpeed).toBe(1.8)
    expect(waypoints[0].commands.map((c) => c.command)).toEqual([MavCmd.MAV_CMD_NAV_WAYPOINT])
  })

  // NaviLync reaches PX4 through mavlink2rest, which takes JSON; NaN (PX4's "keep current heading") has no JSON form
  test('NAV_WAYPOINT yaw is 0, a value that survives the JSON sent to mavlink2rest, not NaN', () => {
    const [nav] = makeDefaultNavCommands()
    expect(nav.command).toBe(MavCmd.MAV_CMD_NAV_WAYPOINT)
    expect(nav.param4).toBe(0)

    const [item] = JSON.parse(JSON.stringify(convertCockpitWaypointsToMavlink(line(1), systemId)))
    expect(item.param4).toBe(0)
  })

  test.each([
    ['1 WP', line(1)],
    ['3 WP', line(3)],
    ['lawnmower grid with turns', lawnmower(6, 5)],
    ['61 WP', line(61)],
  ])('round trip plan → MAVLink → plan is identical for %s', (_, plan) => {
    for (const speed of [1, 2]) {
      const result = roundTrip(plan, speed)
      expect(result.cruiseSpeed).toBe(speed)
      expectSamePlan(result.waypoints, plan)
    }
  })
})
