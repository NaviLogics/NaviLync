import type { Waypoint } from '@/types/mission'

/**
 * Map each mission item seq to the number of the waypoint marker it belongs to
 * @param {Waypoint[]} items The mission as uploaded
 * @param {number} firstWaypointIndex Index of the first item shown as a waypoint marker
 * @returns {Record<number, number>} Marker number (1-based) by mission seq
 */
export const markerNumberByMissionSeq = (items: Waypoint[], firstWaypointIndex: number): Record<number, number> => {
  void items
  void firstWaypointIndex
  return {}
}

/**
 * The number of the waypoint marker the vehicle is heading to
 * @param {Waypoint[]} items The mission as uploaded
 * @param {number} firstWaypointIndex Index of the first item shown as a waypoint marker
 * @param {number} currentSeq The seq of MISSION_CURRENT
 * @returns {number | undefined} Marker number (1-based), undefined when no marker is current
 */
export const currentMarkerNumber = (
  items: Waypoint[],
  firstWaypointIndex: number,
  currentSeq: number
): number | undefined => {
  void items
  void firstWaypointIndex
  void currentSeq
  return undefined
}
