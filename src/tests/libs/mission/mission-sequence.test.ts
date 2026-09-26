import { describe, expect, test } from 'vitest'

import { makeDefaultNavCommands, withCruiseSpeed } from '@/libs/mission/mission-items'
import { currentMarkerNumber, markerNumberByMissionSeq } from '@/libs/mission/mission-sequence'
import { convertCockpitWaypointsToMavlink } from '@/libs/vehicle/mavlink/types'
import { type Waypoint, AltitudeReferenceType } from '@/types/mission'

const waypoint = (latitude: number, longitude: number): Waypoint => ({
  id: `${latitude},${longitude}`,
  coordinates: [latitude, longitude],
  altitude: 0,
  altitudeReferenceType: AltitudeReferenceType.RELATIVE_TO_HOME,
  commands: makeDefaultNavCommands(),
})

const plan = [waypoint(55.75, 37.61), waypoint(55.751, 37.611), waypoint(55.752, 37.612)]

// The markers drawn on the map: one per waypoint from the first one, numbered from 1
const markerNumbers = (items: Waypoint[], firstWaypointIndex: number): number[] =>
  items.slice(firstWaypointIndex).map((_, i) => i + 1)

describe('mission seq ↔ waypoint marker with the speed item at seq 0 (P5)', () => {
  // PX4: no HOME item, so markers start at item 0. Uploaded: seq 0 DO_CHANGE_SPEED, seq 1..3 the waypoints.
  const px4Mission = withCruiseSpeed(plan, 1.5)
  const px4FirstWaypoint = 0

  test('the uploaded mission is seq 0 speed, then the 3 waypoints', () => {
    const items = convertCockpitWaypointsToMavlink(px4Mission, 1)
    expect(items.map((item) => item.seq)).toEqual([0, 1, 2, 3])
    expect(markerNumbers(px4Mission, px4FirstWaypoint)).toEqual([1, 2, 3])
  })

  test.each([
    [1, 1],
    [2, 2],
    [3, 3],
  ])('MISSION_CURRENT seq %i → current marker %i', (seq, marker) => {
    expect(currentMarkerNumber(px4Mission, px4FirstWaypoint, seq)).toBe(marker)
  })

  test('MISSION_CURRENT on the speed item (seq 0) → heading to marker 1', () => {
    expect(currentMarkerNumber(px4Mission, px4FirstWaypoint, 0)).toBe(1)
  })

  test('MISSION_ITEM_REACHED seq → marker: the speed item and WP 1 belong to marker 1', () => {
    expect(markerNumberByMissionSeq(px4Mission, px4FirstWaypoint)).toEqual({ 0: 1, 1: 1, 2: 2, 3: 3 })
  })

  test('the speed item also goes first at 1 m/s, the speed the operator sees', () => {
    const items = convertCockpitWaypointsToMavlink(withCruiseSpeed(plan, 1), 1)
    expect(items).toHaveLength(4)
    expect(items[0].param2).toBe(1)
    expect(currentMarkerNumber(withCruiseSpeed(plan, 1), px4FirstWaypoint, 3)).toBe(3)
  })

  // ArduPilot keeps HOME as item 0: it is not a marker, and while it is current no marker is
  test('ArduPilot, HOME at item 0: markers and current marker as before', () => {
    const arduPilotMission = [waypoint(55.7, 37.6), ...withCruiseSpeed(plan, 1.5)]
    const arduPilotFirstWaypoint = 1

    expect(markerNumberByMissionSeq(arduPilotMission, arduPilotFirstWaypoint)).toEqual({ 1: 1, 2: 1, 3: 2, 4: 3 })
    expect(currentMarkerNumber(arduPilotMission, arduPilotFirstWaypoint, 0)).toBeUndefined()
    expect(currentMarkerNumber(arduPilotMission, arduPilotFirstWaypoint, 2)).toBe(1)
    expect(currentMarkerNumber(arduPilotMission, arduPilotFirstWaypoint, 4)).toBe(3)
  })
})
