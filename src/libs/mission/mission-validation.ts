import * as turf from '@turf/turf'

import { MavCmd } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import { holdSecondsOf, makeNavDelayCommand } from '@/libs/mission/mission-items'
import { type MissionCommand, type Waypoint, type WaypointCoordinates, MissionCommandType } from '@/types/mission'

/**
 * Vehicle parameters the mission check uses, read from the autopilot when it connects
 */
export interface VehicleMissionParameters {
  /** RO_SPEED_LIM: the highest speed the rover controller allows, in m/s */
  speedLimit?: number
  /** NAV_ACC_RAD: the acceptance radius of every waypoint of a PX4 rover (param2 is for multicopters only), in m */
  acceptanceRadius?: number
}

/** Something in the mission that may not go as planned; the operator may still upload it */
export type MissionWarning =
  | {
      /** The last waypoint is approached too fast or without holding there */
      kind: 'lastWaypointNotStopped'
      /** The speed the last waypoint is approached at, in m/s; undefined when the mission sets none */
      speed: number | undefined
      /** The hold time at the last waypoint, in s */
      holdSeconds: number
    }
  | {
      /** A leg is shorter than twice the acceptance radius of the waypoint it ends at */
      kind: 'legShorterThanAcceptance'
      /** The waypoint the leg ends at, numbered from 1 as on the map */
      marker: number
      /** The leg length, in m */
      legLength: number
      /** The acceptance radius of that waypoint, in m */
      radius: number
    }
  | {
      /** NAV_ACC_RAD is wide for the line spacing: the boat may enter a line up to that far to the side */
      kind: 'acceptanceRadiusWideForLines'
      /** NAV_ACC_RAD, in m */
      radius: number
      /** The distance between survey lines, in m */
      spacing: number
    }
  | {
      /** A mission speed is over the vehicle's speed limit */
      kind: 'speedOverLimit'
      /** The mission speed, in m/s */
      speed: number
      /** RO_SPEED_LIM, in m/s */
      limit: number
    }

/** Something that makes the mission impossible to upload */
export type MissionError =
  | {
      /** The mission has no waypoint */
      kind: 'noWaypoints'
    }
  | {
      /** A speed that is not a positive number */
      kind: 'invalidSpeed'
      /** The speed as set */
      speed: number
    }
  | {
      /** A waypoint without valid coordinates */
      kind: 'invalidCoordinates'
      /** The waypoint, numbered from 1 */
      marker: number
    }

// Over this the vehicle overshoots the last waypoint by inertia (pilot logs 26, 30 and 43)
export const LAST_WAYPOINT_MAX_SPEED = 0.5

// NAV_ACC_RAD over this, with lines closer than NARROW_LINE_SPACING, shifts the start of a line to the side
const WIDE_ACCEPTANCE_RADIUS = 1.5
const NARROW_LINE_SPACING = 2

/**
 * Check a mission before it is uploaded
 * @param {Waypoint[]} waypoints - The mission as it will be uploaded, speed items included
 * @param {VehicleMissionParameters} parameters - The vehicle parameters known so far
 * @param {number} [lineSpacing] - The narrowest distance between survey lines, in m, when the mission has a survey
 * @returns {{ warnings: MissionWarning[], errors: MissionError[] }} What the operator should know before uploading
 */
export const validateMission = (
  waypoints: Waypoint[],
  parameters: VehicleMissionParameters,
  lineSpacing?: number
): {
  /** Issues the operator may accept */
  warnings: MissionWarning[]
  /** Issues that stop the upload */
  errors: MissionError[]
} => {
  const warnings: MissionWarning[] = []
  const errors: MissionError[] = []
  if (waypoints.length === 0) return { warnings, errors: [{ kind: 'noWaypoints' }] }

  // Walk the mission as PX4 runs it: each waypoint's commands in order, a speed item changing the speed from there on
  let currentSpeed: number | undefined = undefined
  const approachSpeeds: (number | undefined)[] = []
  waypoints.forEach((waypoint, index) => {
    if (!waypoint.coordinates.every((value) => Number.isFinite(value))) {
      errors.push({ kind: 'invalidCoordinates', marker: index + 1 })
    }
    for (const command of waypoint.commands) {
      if (command.command === MavCmd.MAV_CMD_DO_CHANGE_SPEED) {
        const speed = Number(command.param2)
        if (!(speed > 0)) {
          errors.push({ kind: 'invalidSpeed', speed })
          continue
        }
        currentSpeed = speed
        if (parameters.speedLimit !== undefined && speed > parameters.speedLimit) {
          warnings.push({ kind: 'speedOverLimit', speed, limit: parameters.speedLimit })
        }
      }
      if (command.command === MavCmd.MAV_CMD_NAV_WAYPOINT) approachSpeeds[index] = currentSpeed
    }
  })

  const lastIndex = waypoints.length - 1
  // A PX4 rover accepts every waypoint by NAV_ACC_RAD; param2 is used for multicopters only (PX4 v1.17,
  // mission_block.cpp, is_mission_item_reached)
  const radius = parameters.acceptanceRadius

  for (let index = 1; index < waypoints.length; index++) {
    if (radius === undefined || errors.some((error) => error.kind === 'invalidCoordinates')) continue
    const legLength = distanceInMeters(waypoints[index - 1].coordinates, waypoints[index].coordinates)
    if (legLength < 2 * radius) {
      warnings.push({ kind: 'legShorterThanAcceptance', marker: index + 1, legLength, radius })
    }
  }

  // The rover stops within NAV_ACC_RAD of a turn point, wherever it is across the line it enters next
  if (
    radius !== undefined &&
    lineSpacing !== undefined &&
    radius > WIDE_ACCEPTANCE_RADIUS &&
    lineSpacing < NARROW_LINE_SPACING
  ) {
    warnings.push({ kind: 'acceptanceRadiusWideForLines', radius, spacing: lineSpacing })
  }

  const lastSpeed = approachSpeeds[lastIndex]
  const lastHold = holdSecondsOf(waypoints[lastIndex])
  if (lastSpeed === undefined || lastSpeed > LAST_WAYPOINT_MAX_SPEED || !(lastHold > 0)) {
    warnings.push({ kind: 'lastWaypointNotStopped', speed: lastSpeed, holdSeconds: lastHold })
  }

  return { warnings, errors }
}

const distanceInMeters = (from: WaypointCoordinates, to: WaypointCoordinates): number =>
  turf.distance(turf.point([from[1], from[0]]), turf.point([to[1], to[0]]), { units: 'meters' })

/**
 * Make the vehicle stop at the last waypoint: approach it at a low speed and hold there with NAV_DELAY
 * @param {Waypoint[]} waypoints - The mission; not modified
 * @param {number} [brakeSpeed] - The speed to approach the last waypoint at, in m/s
 * @param {number} [holdSeconds] - How long to hold at the last waypoint, in s
 * @returns {Waypoint[]} The mission with the stop
 */
export const withStopAtLastWaypoint = (waypoints: Waypoint[], brakeSpeed = 0.3, holdSeconds = 3): Waypoint[] => {
  if (waypoints.length === 0) return waypoints
  const copy: Waypoint[] = JSON.parse(JSON.stringify(waypoints))
  const last = copy[copy.length - 1]
  const brake: MissionCommand = {
    type: MissionCommandType.MAVLINK_NON_NAV_COMMAND,
    command: MavCmd.MAV_CMD_DO_CHANGE_SPEED,
    // Ground speed
    param1: 1,
    param2: brakeSpeed,
    // No throttle change
    param3: -1,
    param4: 0,
    x: 0,
    y: 0,
    z: 0,
  }
  const others = last.commands.filter(
    (command) => command.command !== MavCmd.MAV_CMD_DO_CHANGE_SPEED && command.command !== MavCmd.MAV_CMD_NAV_DELAY
  )
  last.commands = [
    brake,
    ...others.map((command) => (command.command === MavCmd.MAV_CMD_NAV_WAYPOINT ? { ...command, param1: 0 } : command)),
    makeNavDelayCommand(holdSeconds),
  ]
  return copy
}
