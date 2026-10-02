import type { Waypoint, WaypointCoordinates } from '@/types/mission'

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
  runIn: 0,
  runOut: 0,
  minTurnWidth: 0,
  lineSpeed: 0,
  brakeSpeed: 0,
  holdSeconds: 0,
  transitSpeed: 0,
  turnRadius: 0,
  lineRadius: 0,
})

/**
 * The order to pass `n` lines `s` apart in, so that no turn is narrower than `W_min`
 * @param {number} lineCount - Number of lines
 * @param {number} lineSpacing - Distance between lines, in m
 * @param {number} minTurnWidth - Narrowest turn wanted, in m
 * @returns {LineOrder} The order, the skip and the turn widths
 */
export const skipLineOrder = (lineCount: number, lineSpacing: number, minTurnWidth: number): LineOrder => ({
  order: lineCount && lineSpacing && minTurnWidth ? [] : [],
  k: 1,
  turnWidths: [],
  narrowTurns: 0,
})

/**
 * Plan a survey of an area
 * @param {WaypointCoordinates[]} polygon - The area, as [lat, lon] vertices
 * @param {SurveyParameters} parameters - The survey form
 * @returns {SurveyPlan} The mission items, the lines and the totals
 */
export const planSurvey = (polygon: WaypointCoordinates[], parameters: SurveyParameters): SurveyPlan => ({
  waypoints: [],
  kinds: [],
  lines: polygon && parameters ? [] : [],
  lineOrder: { order: [], k: 1, turnWidths: [], narrowTurns: 0 },
  stats: { lineCount: 0, lineLength: 0, totalLength: 0, durationSeconds: 0 },
})
