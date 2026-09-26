import { type MissionCommand, type Waypoint, MissionCommandType } from '@/types/mission'

// The commands that become mission items, each taking its own seq (see convertCockpitWaypointsToMavlink)
const isMissionItem = (command: MissionCommand): boolean =>
  command.type === MissionCommandType.MAVLINK_NAV_COMMAND || command.type === MissionCommandType.MAVLINK_NON_NAV_COMMAND

/**
 * Map each mission item seq to the number of the waypoint marker it belongs to. Seqs are counted over all items in
 * upload order, so DO items (e.g. the mission speed at seq 0) take their own seq and belong to their waypoint.
 * @param {Waypoint[]} items The mission as uploaded
 * @param {number} firstWaypointIndex Index of the first item shown as a waypoint marker: 0 for PX4, 1 for ArduPilot,
 * whose item 0 is HOME
 * @returns {Record<number, number>} Marker number (1-based) by mission seq; seqs of items before the first marker
 * (ArduPilot HOME) are absent
 * @example
 * // PX4, 3 WPs at 1.5 m/s: seq 0 speed, seq 1-3 waypoints
 * markerNumberByMissionSeq(withCruiseSpeed(waypoints, 1.5), 0) // { 0: 1, 1: 1, 2: 2, 3: 3 }
 */
export const markerNumberByMissionSeq = (items: Waypoint[], firstWaypointIndex: number): Record<number, number> => {
  const markerBySeq: Record<number, number> = {}
  let seq = 0
  items.forEach((waypoint, index) => {
    waypoint.commands.filter(isMissionItem).forEach(() => {
      if (index >= firstWaypointIndex) markerBySeq[seq] = index - firstWaypointIndex + 1
      seq += 1
    })
  })
  return markerBySeq
}

/**
 * The number of the waypoint marker the vehicle is on its way to, from the seq in MISSION_CURRENT
 * @param {Waypoint[]} items The mission as uploaded
 * @param {number} firstWaypointIndex Index of the first item shown as a waypoint marker (see markerNumberByMissionSeq)
 * @param {number} currentSeq The seq of MISSION_CURRENT
 * @returns {number | undefined} Marker number (1-based); the last marker once past the end of the mission; undefined
 * while an item before the first marker (ArduPilot HOME) is current
 */
export const currentMarkerNumber = (
  items: Waypoint[],
  firstWaypointIndex: number,
  currentSeq: number
): number | undefined => {
  const markerBySeq = markerNumberByMissionSeq(items, firstWaypointIndex)
  const seqs = Object.keys(markerBySeq).map(Number)
  if (seqs.length === 0) return undefined

  const lastSeq = Math.max(...seqs)
  return currentSeq > lastSeq ? markerBySeq[lastSeq] : markerBySeq[currentSeq]
}
