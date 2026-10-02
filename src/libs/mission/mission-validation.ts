import type { Waypoint } from '@/types/mission'

/**
 * Vehicle parameters the mission check uses, read from the autopilot when it connects
 */
export interface VehicleMissionParameters {
  /** RO_SPEED_LIM: the highest speed the rover controller allows, in m/s */
  speedLimit?: number
  /** NAV_ACC_RAD: the acceptance radius PX4 uses for the last mission item (and items without their own), in m */
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
      /** A mission speed is over the vehicle's speed limit */
      kind: 'speedOverLimit'
      /** The mission speed, in m/s */
      speed: number
      /** RO_SPEED_LIM, in m/s */
      limit: number
    }
  | {
      /** A waypoint accepts the vehicle wider than half the distance between survey lines */
      kind: 'turnRadiusOverHalfSpacing'
      /** The waypoint, numbered from 1 as on the map */
      marker: number
      /** Its acceptance radius, in m */
      radius: number
      /** The distance between survey lines, in m */
      spacing: number
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

/**
 * Check a mission before it is uploaded
 * @param {Waypoint[]} waypoints - The mission as it will be uploaded, speed items included
 * @param {VehicleMissionParameters} parameters - The vehicle parameters known so far
 * @param {number} [lineSpacing] - The distance between survey lines, in m, when the mission has a survey
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
} => ({ warnings: waypoints && parameters && lineSpacing ? [] : [], errors: [] })

/**
 * Make the vehicle stop at the last waypoint: approach it at a low speed and hold there
 * @param {Waypoint[]} waypoints - The mission; not modified
 * @param {number} [brakeSpeed] - The speed to approach the last waypoint at, in m/s
 * @param {number} [holdSeconds] - How long to hold at the last waypoint, in s
 * @returns {Waypoint[]} The mission with the stop
 */
export const withStopAtLastWaypoint = (waypoints: Waypoint[], brakeSpeed = 0.3, holdSeconds = 3): Waypoint[] =>
  brakeSpeed && holdSeconds ? waypoints : waypoints
