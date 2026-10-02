import * as turf from '@turf/turf'
import { describe, expect, test } from 'vitest'

import { MavCmd } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import {
  type SurveyParameters,
  defaultSurveyParameters,
  planSurvey,
  skipLineOrder,
} from '@/libs/mission/survey-planner'
import type { WaypointCoordinates } from '@/types/mission'

// A local frame in metres: x east, y north, from a point in the Moscow region
const origin = { lat: 55.75, lon: 37.6 }
const metersPerDegreeLat = 111_195
const toLatLon = (x: number, y: number): WaypointCoordinates => [
  origin.lat + y / metersPerDegreeLat,
  origin.lon + x / (metersPerDegreeLat * Math.cos((origin.lat * Math.PI) / 180)),
]
const toXY = ([lat, lon]: WaypointCoordinates): [number, number] => [
  (lon - origin.lon) * metersPerDegreeLat * Math.cos((origin.lat * Math.PI) / 180),
  (lat - origin.lat) * metersPerDegreeLat,
]
const rectangle = (width: number, height: number): WaypointCoordinates[] => [
  toLatLon(0, 0),
  toLatLon(width, 0),
  toLatLon(width, height),
  toLatLon(0, height),
]
const inside = (polygon: WaypointCoordinates[], point: WaypointCoordinates): boolean =>
  turf.booleanPointInPolygon(
    turf.point([point[1], point[0]]),
    turf.polygon([[...polygon, polygon[0]].map(([lat, lon]) => [lon, lat])])
  )
// East-west lines, along the long side of the rectangles below
const params = (overrides: Partial<SurveyParameters> = {}): SurveyParameters => ({
  ...defaultSurveyParameters(overrides.lineSpacing ?? 5),
  linesAngle: 90,
  ...overrides,
})
const navParams = (
  plan: ReturnType<typeof planSurvey>,
  index: number
): {
  /**
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc *
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
   */
  hold: number
  /**
hhhhhhhhhhhhhh *
hhhhhhhhhhhhhh
   */
  radius: number
} => {
  const nav = plan.waypoints[index].commands.find((c) => c.command === MavCmd.MAV_CMD_NAV_WAYPOINT)!
  return { hold: nav.param1, radius: nav.param2 }
}
// The mission commands of the survey in the order PX4 runs them
const sequence = (plan: ReturnType<typeof planSurvey>): string[] =>
  plan.waypoints.flatMap((waypoint, i) =>
    waypoint.commands.map((c) => (c.command === MavCmd.MAV_CMD_NAV_WAYPOINT ? plan.kinds[i] : `speed ${c.param2}`))
  )

// Release 1.0, task 1
describe('survey planner: defaults of the Navis profile', () => {
  test('values of the spec', () => {
    expect(defaultSurveyParameters(5)).toMatchObject({
      lineSpacing: 5,
      runIn: 5,
      runOut: 5,
      minTurnWidth: 4,
      lineSpeed: 1.5,
      brakeSpeed: 0.3,
      holdSeconds: 3,
      transitSpeed: 2,
      turnRadius: 1,
      lineRadius: 1,
    })
  })

  test('with lines 1 m apart the run-in is 8 m', () => {
    expect(defaultSurveyParameters(1).runIn).toBe(8)
    expect(defaultSurveyParameters(2).runIn).toBe(8)
    expect(defaultSurveyParameters(2.5).runIn).toBe(5)
  })
})

describe('survey planner: lines and turns', () => {
  // Rule: the first line s/2 inside the area, then every s while still s/2 inside it, so each line covers ±s/2
  test('20 × 10 m, s = 5, W_min = 4: two lines, a plain zigzag, run-ins outside the area', () => {
    const area = rectangle(20, 10)
    const plan = planSurvey(area, params({ lineSpacing: 5, minTurnWidth: 4 }))

    expect(plan.lines).toHaveLength(2)
    expect(plan.lineOrder.k).toBe(1)
    expect(plan.lineOrder.order).toEqual([0, 1])
    plan.kinds.forEach((kind, i) => {
      if (kind === 'runInStart' || kind === 'runOutEnd' || kind === 'approach') {
        expect(inside(area, plan.waypoints[i].coordinates)).toBe(false)
      }
    })
    const ys = plan.lines.map(([start]) => toXY(start)[1])
    expect(ys[0]).toBeCloseTo(2.5, 1)
    expect(ys[1]).toBeCloseTo(7.5, 1)
  })

  test('40 × 20 m, s = 1, W_min = 4: k = 5, two full blocks, no turn narrower than 4 m', () => {
    const plan = planSurvey(rectangle(40, 20), params({ lineSpacing: 1, minTurnWidth: 4 }))
    const { order, k, turnWidths, narrowTurns } = plan.lineOrder

    expect(plan.lines).toHaveLength(20)
    expect(k).toBe(5)
    expect(turnWidths.map((w) => Math.round(w))).toEqual([5, 4, 5, 4, 5, 4, 5, 4, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5])
    expect(Math.min(...turnWidths)).toBeGreaterThanOrEqual(4)
    expect(narrowTurns).toBe(0)
    expect([...order].sort((a, b) => a - b)).toEqual([...Array(20).keys()])

    // Directions alternate: each line is passed the opposite way to the one before
    const lineDirections = plan.waypoints
      .map((w, i) => ({ kind: plan.kinds[i], x: toXY(w.coordinates)[0] }))
      .filter((p) => p.kind === 'lineStart' || p.kind === 'lineEnd')
    for (let line = 0; line < 20; line++) {
      const [start, end] = [lineDirections[2 * line], lineDirections[2 * line + 1]]
      expect(Math.sign(end.x - start.x)).toBe(line % 2 === 0 ? 1 : -1)
    }
  })

  test('13 lines at k = 5: a tail of 3 lines, and the narrow turns are counted for the warning', () => {
    const result = skipLineOrder(13, 1, 4)
    expect(result.k).toBe(5)
    expect([...result.order].sort((a, b) => a - b)).toEqual([...Array(13).keys()])
    expect(result.order.slice(0, 10)).toEqual([0, 5, 1, 6, 2, 7, 3, 8, 4, 9])
    expect(result.narrowTurns).toBeGreaterThan(0)
    expect(result.turnWidths.filter((w) => w < 4)).toHaveLength(result.narrowTurns)
  })

  test('s ≥ W_min: zigzag without skipping', () => {
    expect(skipLineOrder(4, 5, 4)).toMatchObject({ order: [0, 1, 2, 3], k: 1, narrowTurns: 0 })
  })
})

describe('survey planner: mission items', () => {
  test('each line: R(hold) → speed v_line → S → E → speed v_brake → T(hold), with R, S, E, T on one line', () => {
    const p = params({ lineSpacing: 5, minTurnWidth: 4 })
    const plan = planSurvey(rectangle(20, 10), p)
    const perLine = ['runInStart', 'speed 1.5', 'lineStart', 'lineEnd', 'speed 0.3', 'runOutEnd']

    expect(sequence(plan)).toEqual(['approach', 'speed 0.3', ...perLine, ...perLine])

    for (let line = 0; line < 2; line++) {
      const base = 1 + line * 4
      const [r, s, e, t] = [0, 1, 2, 3].map((j) => toXY(plan.waypoints[base + j].coordinates))
      const cross = (a: number[], b: number[], c: number[]): number =>
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      expect(Math.abs(cross(r, s, e))).toBeLessThan(0.05)
      expect(Math.abs(cross(r, s, t))).toBeLessThan(0.05)
      expect(Math.hypot(s[0] - r[0], s[1] - r[1])).toBeCloseTo(p.runIn, 1)
      expect(Math.hypot(t[0] - e[0], t[1] - e[1])).toBeCloseTo(p.runOut, 1)
      expect(navParams(plan, base)).toEqual({ hold: 3, radius: 1 })
      expect(navParams(plan, base + 1)).toEqual({ hold: 0, radius: 1 })
      expect(navParams(plan, base + 3)).toEqual({ hold: 3, radius: 1 })
    }
  })

  test('the mission ends at T of the last line, held, approached at v_brake', () => {
    const plan = planSurvey(rectangle(20, 10), params())
    const last = plan.waypoints.length - 1
    expect(plan.kinds[last]).toBe('runOutEnd')
    expect(navParams(plan, last).hold).toBe(3)
    expect(sequence(plan).slice(-2)).toEqual(['speed 0.3', 'runOutEnd'])
  })

  test('the approach to the first run-in is braked too: v_brake from a point d_out before R', () => {
    const p = params()
    const plan = planSurvey(rectangle(20, 10), p)
    const [a, r] = [toXY(plan.waypoints[0].coordinates), toXY(plan.waypoints[1].coordinates)]
    expect(plan.kinds[0]).toBe('approach')
    expect(Math.hypot(r[0] - a[0], r[1] - a[1])).toBeCloseTo(p.runOut, 1)
  })

  test('an L-shaped area: a line cut by the notch gives two lines, both passed', () => {
    // 30 × 20 m without its top right 15 × 10 m quarter
    const area = [
      toLatLon(0, 0),
      toLatLon(30, 0),
      toLatLon(30, 10),
      toLatLon(15, 10),
      toLatLon(15, 20),
      toLatLon(0, 20),
    ]
    const plan = planSurvey(area, params({ lineSpacing: 5, linesAngle: 0, minTurnWidth: 4 }))
    // North-south lines at x = 2.5 … 27.5: the ones east of x = 15 stop at y = 10
    expect(plan.lines).toHaveLength(6)
    const covered = plan.lines.map(([start, end]) => Math.abs(toXY(end)[1] - toXY(start)[1]))
    expect(covered.filter((length) => Math.abs(length - 20) < 0.2)).toHaveLength(3)
    expect(covered.filter((length) => Math.abs(length - 10) < 0.2)).toHaveLength(3)
    expect([...plan.lineOrder.order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
  })

  test('totals: lines, their length, the route and the time with speeds and holds', () => {
    const plan = planSurvey(rectangle(20, 10), params())
    expect(plan.stats.lineCount).toBe(2)
    expect(plan.stats.lineLength).toBeCloseTo(40, 0)
    expect(plan.stats.totalLength).toBeGreaterThan(plan.stats.lineLength)
    // Lines at 1.5 m/s, everything else at 0.3 m/s, four 3 s holds
    expect(plan.stats.durationSeconds).toBeGreaterThan(40 / 1.5 + 4 * 3)
  })
})
