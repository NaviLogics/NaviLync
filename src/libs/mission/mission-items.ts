import { MavCmd } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import { type MissionCommand, type Waypoint, MissionCommandType } from '@/types/mission'

// The planner's default cruise speed, taken for a downloaded mission without a speed item. T3 will read PX4's own
// speed parameter instead, which is what the vehicle actually uses then.
const defaultCruiseSpeed = 1

/**
 * The commands of a new mission waypoint: a single NAV_WAYPOINT
 * @returns {MissionCommand[]} A fresh copy of the commands, safe to modify
 */
export const makeDefaultNavCommands = (): MissionCommand[] => [
  {
    type: MissionCommandType.MAVLINK_NAV_COMMAND,
    command: MavCmd.MAV_CMD_NAV_WAYPOINT,
    param1: 0,
    param2: 5,
    param3: 0,
    // Yaw. PX4 reads NaN as "keep the current heading", but NaN cannot be sent: mission items reach PX4 as JSON through
    // mavlink2rest, and JSON has no NaN. 999, the old sentinel, is rejected by PX4 as an invalid mission item. Surface
    // vehicles ignore the yaw at a waypoint, so 0 is sent until NaviLync speaks MAVLink directly.
    param4: 0,
  },
]

const isSpeedCommand = (command: MissionCommand): boolean => command.command === MavCmd.MAV_CMD_DO_CHANGE_SPEED

/**
 * Put the mission cruise speed at the start of the mission, as a DO_CHANGE_SPEED item before the first waypoint, so
 * the vehicle already runs the first leg at that speed. It is added at 1 m/s too: without it PX4 would run at its own
 * speed parameter, not at the speed the operator sees in NaviLync.
 * @param {Waypoint[]} waypoints The planned waypoints; they are not modified
 * @param {number} cruiseSpeed The mission cruise speed, in m/s
 * @returns {Waypoint[]} The waypoints to upload, the first one starting with the speed item
 * @example
 * // With a 2 m/s cruise speed the uploaded mission is: seq 0 DO_CHANGE_SPEED (ground speed, 2), seq 1 first WP, ...
 * withCruiseSpeed(waypoints, 2)
 */
export const withCruiseSpeed = (waypoints: Waypoint[], cruiseSpeed: number): Waypoint[] => {
  if (waypoints.length === 0) return waypoints

  const [first, ...rest] = waypoints
  const speedCommand: MissionCommand = {
    type: MissionCommandType.MAVLINK_NON_NAV_COMMAND,
    command: MavCmd.MAV_CMD_DO_CHANGE_SPEED,
    // Ground speed, as a surface vehicle has no airspeed
    param1: 1,
    param2: Number(cruiseSpeed),
    // No throttle change
    param3: -1,
    param4: 0,
    x: 0,
    y: 0,
    z: 0,
  }
  return [{ ...first, commands: [speedCommand, ...first.commands.filter((c) => !isSpeedCommand(c))] }, ...rest]
}

/**
 * Take the mission cruise speed back out of a downloaded mission: the inverse of `withCruiseSpeed`. Also reads the
 * speed item that older NaviLync versions put right after the first waypoint.
 * @param {Waypoint[]} waypoints The downloaded waypoints; they are not modified
 * @returns {{ waypoints: Waypoint[], cruiseSpeed: number }} The waypoints without the speed item of the first one,
 * and the cruise speed it set (1 m/s when there is none, e.g. a mission planned in QGC)
 */
export const extractCruiseSpeed = (
  waypoints: Waypoint[]
): {
  /** The waypoints without the speed item */
  waypoints: Waypoint[]
  /** The mission cruise speed, in m/s */
  cruiseSpeed: number
} => {
  const [first, ...rest] = waypoints
  const speedCommands = first?.commands.filter(isSpeedCommand) ?? []
  const speed = speedCommands[speedCommands.length - 1]?.param2
  if (speedCommands.length === 0) return { waypoints, cruiseSpeed: defaultCruiseSpeed }

  return {
    waypoints: [{ ...first, commands: first.commands.filter((c) => !isSpeedCommand(c)) }, ...rest],
    cruiseSpeed: speed !== undefined && speed > 0 ? speed : defaultCruiseSpeed,
  }
}
