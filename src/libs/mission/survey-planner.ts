import { v4 as uuid } from 'uuid'

import { MavCmd } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import {
  type MissionCommand,
  type Waypoint,
  type WaypointCoordinates,
  AltitudeReferenceType,
  MissionCommandType,
} from '@/types/mission'

/**
 * The survey form: lines, run-ins, stops and speeds (release 1.0, task 1)
 */
export interface SurveyParameters {
  /** Distance between lines `s`, in m (0.5–50) */
  lineSpacing: number
  /** Direction of the lines, in degrees clockwise from north (0–180) */
  linesAngle: number
  /** Run-in before a line `d_in`, in m: the vehicle speeds up on it */
  runIn: number
  /** Run-out after a line `d_out`, in m: the vehicle brakes on it */
  runOut: number
  /** Narrowest turn `W_min` between two lines passed one after the other, in m */
  minTurnWidth: number
  /** Speed on the lines `v_line`, in m/s */
  lineSpeed: number
  /** Speed to the turn points and between lines `v_brake`, in m/s */
  brakeSpeed: number
  /** Hold at the turn points `t_hold`, in s */
  holdSeconds: number
  /** Speed to and from the area `v_transit`, in m/s */
  transitSpeed: number
  /** Acceptance radius of the turn points `r_turn`, in m */
  turnRadius: number
  /** Acceptance radius of the points at the ends of the lines `r_line`, in m */
  lineRadius: number
}

/** What a survey waypoint is for */
export type SurveyPointKind = 'approach' | 'runInStart' | 'lineStart' | 'lineEnd' | 'runOutEnd'

/**
 * The order the lines are passed in
 */
export interface LineOrder {
  /** Line indices (across the area, 0 first) in the order they are passed */
  order: number[]
  /** Lines skipped between two passed one after the other; 1 when no line is skipped */
  k: number
  /** Width of each turn between consecutive lines, in m */
  turnWidths: number[]
  /** Turns narrower than the minimum width that could not be avoided */
  narrowTurns: number
}

/**
 * A planned survey
 */
export interface SurveyPlan {
  /** The mission items of the survey */
  waypoints: Waypoint[]
  /** What each waypoint is for, in the same order */
  kinds: SurveyPointKind[]
  /** The lines as cut by the area: start and end of each, across the area in order */
  lines: [WaypointCoordinates, WaypointCoordinates][]
  /** The pass order */
  lineOrder: LineOrder
  /** Totals shown under the survey */
  stats: {
    /** Number of lines */
    lineCount: number
    /** Length of the lines, in m */
    lineLength: number
    /** Length of the whole survey route, run-ins and turns included, in m */
    totalLength: number
    /** Estimated time, with the speeds and holds, in s */
    durationSeconds: number
  }
}

/**
 * The survey form defaults of the Navis profile
 * @param {number} lineSpacing - Distance between lines, in m
 * @returns {SurveyParameters} The defaults; the run-in is 8 m for lines 2 m apart or closer
 */
export const defaultSurveyParameters = (lineSpacing = 5): SurveyParameters => ({
  lineSpacing,
  linesAngle: 0,
  runIn: lineSpacing <= 2 ? 8 : 5,
  runOut: 5,
  minTurnWidth: 4,
  lineSpeed: 1.5,
  brakeSpeed: 0.3,
  holdSeconds: 3,
  transitSpeed: 2,
  turnRadius: 1,
  lineRadius: 1,
})

// Tail orders are searched exhaustively up to this many lines, by interleaving patterns above it
const EXHAUSTIVE_TAIL = 7

const permutations = (items: number[]): number[][] =>
  items.length <= 1
    ? [items]
    : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [item, ...p]))

/**
 * The order to pass lines in, from their positions across the area
 * @param {number[]} positions - Position of each line across the area, in m, in increasing order
 * @param {number} lineSpacing - Distance between lines, in m
 * @param {number} minTurnWidth - Narrowest turn wanted, in m
 * @returns {LineOrder} The order, the skip and the turn widths
 */
const orderLines = (positions: number[], lineSpacing: number, minTurnWidth: number): LineOrder => {
  const n = positions.length
  const width = (from: number, to: number): number => Math.abs(positions[to] - positions[from])
  const widthsOf = (order: number[]): number[] => order.slice(1).map((line, i) => width(order[i], line))
  const isNarrow = (w: number): boolean => w < minTurnWidth - 1e-6
  const finish = (order: number[], k: number): LineOrder => {
    const turnWidths = widthsOf(order)
    return { order, k, turnWidths, narrowTurns: turnWidths.filter(isNarrow).length }
  }

  if (lineSpacing >= minTurnWidth || n <= 1) return finish([...Array(n).keys()], 1)

  // Racetrack blocks of 2k lines: turns of k·s and (k−1)·s, every other block mirrored so the step to the next
  // block is (k+1)·s instead of s
  const k = Math.ceil(minTurnWidth / lineSpacing) + 1
  const order: number[] = []
  const fullBlocks = Math.floor(n / (2 * k))
  for (let block = 0; block < fullBlocks; block++) {
    const b = block * 2 * k
    for (let i = 0; i < k; i++) {
      if (block % 2 === 0) order.push(b + i, b + k + i)
      else order.push(b + k + i, b + i)
    }
  }

  // The tail of fewer than 2k lines: the order with the fewest narrow turns, then the widest narrowest turn
  const tail = [...Array(n - fullBlocks * 2 * k).keys()].map((i) => fullBlocks * 2 * k + i)
  if (tail.length > 0) {
    const interleaved = (offset: number): number[] => {
      const [first, second] = [tail.slice(0, offset), tail.slice(offset)]
      const merged: number[] = []
      for (let i = 0; i < Math.max(first.length, second.length); i++) {
        if (i < first.length) merged.push(first[i])
        if (i < second.length) merged.push(second[i])
      }
      return merged
    }
    const candidates =
      tail.length <= EXHAUSTIVE_TAIL
        ? permutations(tail)
        : tail.flatMap((_, offset) => [interleaved(offset), [...interleaved(offset)].reverse()])
    const score = (candidate: number[]): [number, number] => {
      const widths = widthsOf([...order.slice(-1), ...candidate])
      return [widths.filter(isNarrow).length, widths.length ? Math.min(...widths) : Infinity]
    }
    const best = candidates.reduce((bestSoFar, candidate) => {
      const [narrow, narrowest] = score(candidate)
      const [bestNarrow, bestNarrowest] = score(bestSoFar)
      return narrow < bestNarrow || (narrow === bestNarrow && narrowest > bestNarrowest) ? candidate : bestSoFar
    })
    order.push(...best)
  }

  return finish(order, k)
}

/**
 * The order to pass `n` lines `s` apart in, so that no turn is narrower than `W_min`
 * @param {number} lineCount - Number of lines
 * @param {number} lineSpacing - Distance between lines, in m
 * @param {number} minTurnWidth - Narrowest turn wanted, in m
 * @returns {LineOrder} The order, the skip and the turn widths
 * @example
 * // 20 lines 1 m apart, turns of at least 4 m: k = 5, blocks 0 5 1 6 2 7 3 8 4 9 | 15 10 16 11 …
 * skipLineOrder(20, 1, 4)
 */
export const skipLineOrder = (lineCount: number, lineSpacing: number, minTurnWidth: number): LineOrder =>
  orderLines(
    [...Array(lineCount).keys()].map((i) => i * lineSpacing),
    lineSpacing,
    minTurnWidth
  )

const EARTH_RADIUS = 6_371_008.8

/**
 * Plan a survey of an area
 * @param {WaypointCoordinates[]} polygon - The area, as [lat, lon] vertices
 * @param {SurveyParameters} parameters - The survey form
 * @returns {SurveyPlan} The mission items, the lines and the totals
 */
export const planSurvey = (polygon: WaypointCoordinates[], parameters: SurveyParameters): SurveyPlan => {
  const p = parameters
  const empty: SurveyPlan = {
    waypoints: [],
    kinds: [],
    lines: [],
    lineOrder: { order: [], k: 1, turnWidths: [], narrowTurns: 0 },
    stats: { lineCount: 0, lineLength: 0, totalLength: 0, durationSeconds: 0 },
  }
  if (polygon.length < 3 || !(p.lineSpacing > 0)) return empty

  // A local frame in metres around the area: small enough for a flat projection, and the spacing stays exact
  const lat0 = polygon.reduce((sum, [lat]) => sum + lat, 0) / polygon.length
  const lon0 = polygon.reduce((sum, [, lon]) => sum + lon, 0) / polygon.length
  const metersPerRad = EARTH_RADIUS
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180)
  const toLocal = ([lat, lon]: WaypointCoordinates): [number, number] => [
    (((lon - lon0) * Math.PI) / 180) * metersPerRad * cosLat0,
    (((lat - lat0) * Math.PI) / 180) * metersPerRad,
  ]
  const toGeo = (x: number, y: number): WaypointCoordinates => [
    lat0 + ((y / metersPerRad) * 180) / Math.PI,
    lon0 + ((x / (metersPerRad * cosLat0)) * 180) / Math.PI,
  ]

  // Along the lines (a) and across them (c)
  const angle = (p.linesAngle * Math.PI) / 180
  const along: [number, number] = [Math.sin(angle), Math.cos(angle)]
  const across: [number, number] = [-Math.cos(angle), Math.sin(angle)]
  const vertices = polygon.map(toLocal).map(([x, y]) => ({
    a: x * along[0] + y * along[1],
    c: x * across[0] + y * across[1],
  }))
  const toPoint = (a: number, c: number): WaypointCoordinates =>
    toGeo(a * along[0] + c * across[0], a * along[1] + c * across[1])

  // Lines: the first s/2 inside the area, then every s while still s/2 inside, so each covers ±s/2
  const cs = vertices.map((v) => v.c)
  const [cMin, cMax] = [Math.min(...cs), Math.max(...cs)]
  // A thousandth of the spacing of tolerance: the width of a drawn area is never exact
  const rowCount = Math.floor((cMax - cMin) / p.lineSpacing + 1e-3)
  const rows = [...Array(rowCount).keys()].map((i) => cMin + p.lineSpacing / 2 + i * p.lineSpacing)
  if (rows.length === 0) rows.push((cMin + cMax) / 2)

  // Each row cut by the area; a non-convex area may cut a row into several lines
  const segments: {
    /**
     *
     */
    c: number
    /**
     *
     */
    from: number
    /**
     *
     */
    to: number
  }[] = []
  for (const c of rows) {
    const crossings: number[] = []
    vertices.forEach((v1, i) => {
      const v2 = vertices[(i + 1) % vertices.length]
      if ((v1.c <= c && c < v2.c) || (v2.c <= c && c < v1.c)) {
        crossings.push(v1.a + ((c - v1.c) * (v2.a - v1.a)) / (v2.c - v1.c))
      }
    })
    crossings.sort((x, y) => x - y)
    for (let i = 0; i + 1 < crossings.length; i += 2) segments.push({ c, from: crossings[i], to: crossings[i + 1] })
  }
  if (segments.length === 0) return empty

  const lineOrder = orderLines(
    segments.map((segment) => segment.c),
    p.lineSpacing,
    p.minTurnWidth
  )

  const nav = (hold: number, radius: number): MissionCommand => ({
    type: MissionCommandType.MAVLINK_NAV_COMMAND,
    command: MavCmd.MAV_CMD_NAV_WAYPOINT,
    param1: hold,
    param2: radius,
    param3: 0,
    param4: 0,
  })
  const speed = (metersPerSecond: number): MissionCommand => ({
    type: MissionCommandType.MAVLINK_NON_NAV_COMMAND,
    command: MavCmd.MAV_CMD_DO_CHANGE_SPEED,
    // Ground speed, no throttle change
    param1: 1,
    param2: metersPerSecond,
    param3: -1,
    param4: 0,
    x: 0,
    y: 0,
    z: 0,
  })
  const waypoints: Waypoint[] = []
  const kinds: SurveyPointKind[] = []
  const add = (kind: SurveyPointKind, a: number, c: number, commands: MissionCommand[]): void => {
    waypoints.push({
      id: uuid(),
      coordinates: toPoint(a, c),
      altitude: 0,
      altitudeReferenceType: AltitudeReferenceType.RELATIVE_TO_HOME,
      commands,
    })
    kinds.push(kind)
  }

  // Speed items follow the waypoint they apply from, so none sits before the first one, where the mission cruise
  // speed (v_transit) goes
  lineOrder.order.forEach((lineIndex, j) => {
    const { c, from, to } = segments[lineIndex]
    const forward = j % 2 === 0
    const direction = forward ? 1 : -1
    const [start, end] = forward ? [from, to] : [to, from]
    if (j === 0)
      add('approach', start - direction * (p.runIn + p.runOut), c, [nav(0, p.lineRadius), speed(p.brakeSpeed)])
    add('runInStart', start - direction * p.runIn, c, [nav(p.holdSeconds, p.turnRadius), speed(p.lineSpeed)])
    add('lineStart', start, c, [nav(0, p.lineRadius)])
    add('lineEnd', end, c, [nav(0, p.lineRadius), speed(p.brakeSpeed)])
    add('runOutEnd', end + direction * p.runOut, c, [nav(p.holdSeconds, p.turnRadius)])
  })

  // Totals, from the approach point on (the transit to it depends on where the vehicle comes from)
  const local = waypoints.map((waypoint) => toLocal(waypoint.coordinates))
  let currentSpeed = p.brakeSpeed
  let totalLength = 0
  let durationSeconds = 0
  waypoints.forEach((waypoint, i) => {
    if (i > 0) {
      const leg = Math.hypot(local[i][0] - local[i - 1][0], local[i][1] - local[i - 1][1])
      totalLength += leg
      durationSeconds += leg / currentSpeed
    }
    for (const command of waypoint.commands) {
      if (command.command === MavCmd.MAV_CMD_NAV_WAYPOINT) durationSeconds += command.param1
      if (command.command === MavCmd.MAV_CMD_DO_CHANGE_SPEED) currentSpeed = command.param2
    }
  })

  return {
    waypoints,
    kinds,
    lines: segments.map(({ c, from, to }) => [toPoint(from, c), toPoint(to, c)]),
    lineOrder,
    stats: {
      lineCount: segments.length,
      lineLength: segments.reduce((sum, { from, to }) => sum + (to - from), 0),
      totalLength,
      durationSeconds,
    },
  }
}
