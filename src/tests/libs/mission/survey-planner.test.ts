import * as turf from '@turf/turf'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { MavCmd, MavFrame } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import { extractCruiseSpeed, withCruiseSpeed } from '@/libs/mission/mission-items'
import {
  type SurveyParameters,
  defaultSurveyParameters,
  planSurvey,
  skipLineOrder,
} from '@/libs/mission/survey-planner'
import { convertCockpitWaypointsToMavlink, convertMavlinkWaypointsToCockpit } from '@/libs/vehicle/mavlink/types'
import { type WaypointCoordinates, MissionCommandType } from '@/types/mission'

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')

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
/** The NAV_WAYPOINT parameters of a survey waypoint */
interface NavParams {
  /** Hold time, in s */
  hold: number
  /** Acceptance radius, in m */
  radius: number
}
const navParams = (plan: ReturnType<typeof planSurvey>, index: number): NavParams => {
  const nav = plan.waypoints[index].commands.find((c) => c.command === MavCmd.MAV_CMD_NAV_WAYPOINT)!
  return { hold: nav.param1, radius: nav.param2 }
}
// The mission commands of the survey in the order PX4 runs them
const sequence = (plan: ReturnType<typeof planSurvey>): string[] =>
  plan.waypoints.flatMap((waypoint, i) =>
    waypoint.commands.map((c) =>
      c.command === MavCmd.MAV_CMD_NAV_WAYPOINT
        ? plan.kinds[i]
        : c.command === MavCmd.MAV_CMD_NAV_DELAY
        ? `delay ${c.param1}`
        : `speed ${c.param2}`
    )
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
  // PX4 v1.17 rover: NAV_WAYPOINT param1 (hold) is for multicopters only (mission_block.cpp, get_time_inside), so the
  // stops are NAV_DELAY items after R and T
  test('each line: R → delay t_hold → speed v_line → S → E → speed v_brake → T → delay t_hold, on one line', () => {
    const p = params({ lineSpacing: 5, minTurnWidth: 4 })
    const plan = planSurvey(rectangle(20, 10), p)
    const perLine = ['runInStart', 'delay 3', 'speed 1.5', 'lineStart', 'lineEnd', 'speed 0.3', 'runOutEnd', 'delay 3']
    // The first R is on the straight from A0 to S: no stop there (see the SITL test below)
    const firstLine = perLine.filter((_, i) => i !== 1)

    expect(sequence(plan)).toEqual(['approach', 'speed 0.3', ...firstLine, ...perLine])

    for (let line = 0; line < 2; line++) {
      const base = 1 + line * 4
      const [r, s, e, t] = [0, 1, 2, 3].map((j) => toXY(plan.waypoints[base + j].coordinates))
      const cross = (a: number[], b: number[], c: number[]): number =>
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      expect(Math.abs(cross(r, s, e))).toBeLessThan(0.05)
      expect(Math.abs(cross(r, s, t))).toBeLessThan(0.05)
      expect(Math.hypot(s[0] - r[0], s[1] - r[1])).toBeCloseTo(p.runIn, 1)
      expect(Math.hypot(t[0] - e[0], t[1] - e[1])).toBeCloseTo(p.runOut, 1)
      ;[0, 1, 2, 3].forEach((j) => expect(navParams(plan, base + j)).toEqual({ hold: 0, radius: 0 }))
    }
  })

  test('the mission ends at T of the last line, approached at v_brake, then a NAV_DELAY of t_hold', () => {
    const plan = planSurvey(rectangle(20, 10), params())
    const last = plan.waypoints.length - 1
    expect(plan.kinds[last]).toBe('runOutEnd')
    expect(sequence(plan).slice(-3)).toEqual(['speed 0.3', 'runOutEnd', 'delay 3'])
  })

  test('stops are MAV_CMD_NAV_DELAY (param1 t_hold, the others -1); none when t_hold is 0', () => {
    const plan = planSurvey(rectangle(20, 10), params())
    const delays = plan.waypoints.flatMap((w) => w.commands).filter((c) => c.command === MavCmd.MAV_CMD_NAV_DELAY)
    expect(delays).toHaveLength(3)
    delays.forEach((delay) =>
      expect(delay).toMatchObject({
        type: MissionCommandType.MAVLINK_NON_NAV_COMMAND,
        param1: 3,
        param2: -1,
        param3: -1,
        param4: -1,
      })
    )
    const noHold = planSurvey(rectangle(20, 10), params({ holdSeconds: 0 }))
    expect(sequence(noHold)).not.toContainEqual(expect.stringMatching(/^delay/))
  })

  // PX4 v1.17 rover: param2 (acceptance radius) is for multicopters only (mission_block.cpp, is_mission_item_reached);
  // the rover stops within NAV_ACC_RAD (DifferentialPosControl.cpp)
  test('every NAV_WAYPOINT of the survey has param1 0 and param2 0 (PX4 defaults)', () => {
    const plan = planSurvey(rectangle(20, 10), params(), 4.5)
    plan.waypoints.forEach((_, i) => expect(navParams(plan, i)).toEqual({ hold: 0, radius: 0 }))
    expect('turnRadius' in defaultSurveyParameters(5)).toBe(false)
    expect('lineRadius' in defaultSurveyParameters(5)).toBe(false)
  })

  test('the approach to the first run-in is braked too: v_brake from a point d_out before R (slow transit)', () => {
    const p = params()
    const plan = planSurvey(rectangle(20, 10), p)
    const [a, r] = [toXY(plan.waypoints[0].coordinates), toXY(plan.waypoints[1].coordinates)]
    expect(plan.kinds[0]).toBe('approach')
    expect(Math.hypot(r[0] - a[0], r[1] - a[1])).toBeCloseTo(p.runOut, 1)
  })

  test('an L-shaped area: the lines the notch shortens are passed as well', () => {
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

  test('a U-shaped area: a line cut by the notch gives two lines, both passed', () => {
    // 30 × 20 m without the 10 × 10 m middle of its north side
    const area = [
      toLatLon(0, 0),
      toLatLon(30, 0),
      toLatLon(30, 20),
      toLatLon(20, 20),
      toLatLon(20, 10),
      toLatLon(10, 10),
      toLatLon(10, 20),
      toLatLon(0, 20),
    ]
    const plan = planSurvey(area, params({ lineSpacing: 5, minTurnWidth: 4 }))
    // East-west lines at y = 2.5, 7.5 (30 m) and 12.5, 17.5 (cut into two 10 m lines each)
    const lengths = plan.lines.map(([start, end]) => Math.abs(toXY(end)[0] - toXY(start)[0]))
    expect(lengths.filter((length) => Math.abs(length - 30) < 0.2)).toHaveLength(2)
    expect(lengths.filter((length) => Math.abs(length - 10) < 0.2)).toHaveLength(4)
    expect([...plan.lineOrder.order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
    // No line runs across the notch
    plan.lines.forEach(([start, end]) => {
      const middle: WaypointCoordinates = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
      expect(inside(area, middle)).toBe(true)
    })
  })

  test('totals: lines, their length, the route and the time with speeds and holds', () => {
    const plan = planSurvey(rectangle(20, 10), params())
    expect(plan.stats.lineCount).toBe(2)
    expect(plan.stats.lineLength).toBeCloseTo(40, 0)
    expect(plan.stats.totalLength).toBeGreaterThan(plan.stats.lineLength)
    // Lines at 1.5 m/s, everything else at 0.3 m/s, three 3 s holds (none at the first R)
    expect(plan.stats.durationSeconds).toBeGreaterThan(40 / 1.5 + 3 * 3)
    const noHold = planSurvey(rectangle(20, 10), params({ holdSeconds: 0 }))
    expect(plan.stats.durationSeconds - noHold.stats.durationSeconds).toBeCloseTo(3 * 3, 6)
  })
})

const u = (): WaypointCoordinates[] => [
  toLatLon(0, 0),
  toLatLon(30, 0),
  toLatLon(30, 20),
  toLatLon(20, 20),
  toLatLon(20, 10),
  toLatLon(10, 10),
  toLatLon(10, 20),
  toLatLon(0, 20),
]
const stripped = (items: ReturnType<typeof convertCockpitWaypointsToMavlink>): unknown[] =>
  items.map(({ seq, command, param1, param2, x, y }) => ({ seq, command: command.type, param1, param2, x, y }))

// Review of #41
describe('survey planner: review of #41', () => {
  test('cruise speed on a survey: SPEED(v_transit), NAV(A0), SPEED(v_brake), NAV(R0), SPEED(v_line), kept after download', () => {
    const plan = planSurvey(rectangle(20, 10), params(), 2)
    const items = convertCockpitWaypointsToMavlink(withCruiseSpeed(plan.waypoints, 2), 1)

    expect(
      items
        .slice(0, 6)
        .map((item) => [
          item.command.type,
          item.command.type === MavCmd.MAV_CMD_DO_CHANGE_SPEED ? item.param2 : item.param1,
        ])
    ).toEqual([
      [MavCmd.MAV_CMD_DO_CHANGE_SPEED, 2],
      [MavCmd.MAV_CMD_NAV_WAYPOINT, 0],
      [MavCmd.MAV_CMD_DO_CHANGE_SPEED, 0.3],
      [MavCmd.MAV_CMD_NAV_WAYPOINT, 0],
      [MavCmd.MAV_CMD_DO_CHANGE_SPEED, 1.5],
      [MavCmd.MAV_CMD_NAV_WAYPOINT, 0],
    ])
    // PX4 takes NAV_DELAY in MAV_FRAME_MISSION only, without a position (mavlink_mission.cpp)
    const delay = items.find((item) => item.command.type === MavCmd.MAV_CMD_NAV_DELAY)!
    expect(delay.frame.type).toBe(MavFrame.MAV_FRAME_MISSION)
    expect([delay.x, delay.y, delay.z]).toEqual([0, 0, 0])

    // Downloaded from the vehicle: the cruise speed comes back, the braking stays on the approach point
    const downloaded = extractCruiseSpeed(convertMavlinkWaypointsToCockpit(items))
    expect(downloaded.cruiseSpeed).toBe(2)
    expect(downloaded.waypoints[0].commands.map((c) => [c.command, c.param2])).toEqual([
      [MavCmd.MAV_CMD_NAV_WAYPOINT, navParams(plan, 0).radius],
      [MavCmd.MAV_CMD_DO_CHANGE_SPEED, 0.3],
    ])
    const reuploaded = convertCockpitWaypointsToMavlink(
      withCruiseSpeed(downloaded.waypoints, downloaded.cruiseSpeed),
      1
    )
    expect(stripped(reuploaded)).toEqual(stripped(items))
  })

  test('a new cruise speed replaces only the speed item before the first NAV, never the braking after it', () => {
    const plan = planSurvey(rectangle(20, 10), params(), 2)
    const twice = withCruiseSpeed(withCruiseSpeed(plan.waypoints, 2), 3)
    expect(
      twice[0].commands.map((c) => [c.command, c.command === MavCmd.MAV_CMD_DO_CHANGE_SPEED ? c.param2 : 0])
    ).toEqual([
      [MavCmd.MAV_CMD_DO_CHANGE_SPEED, 3],
      [MavCmd.MAV_CMD_NAV_WAYPOINT, 0],
      [MavCmd.MAV_CMD_DO_CHANGE_SPEED, 0.3],
    ])
  })

  test('approach point: PX4 default radius (0, so NAV_ACC_RAD), distance to R max(d_out, v_transit²/2)', () => {
    const area = rectangle(20, 10)
    const approachLength = (plan: ReturnType<typeof planSurvey>): number => {
      const [a, r] = [0, 1].map((i) => toXY(plan.waypoints[i].coordinates))
      return Math.hypot(r[0] - a[0], r[1] - a[1])
    }
    const slow = planSurvey(area, params(), 2)
    const fast = planSurvey(area, params(), 4.5)

    expect(approachLength(slow)).toBeCloseTo(5, 1)
    // About 1 m/s² of braking: 4.5² / 2 ≈ 10 m
    expect(approachLength(fast)).toBeCloseTo(10.125, 1)
    expect(fast.kinds[0]).toBe('approach')
    expect(navParams(slow, 0).radius).toBe(0)
  })

  test('the transit speed is the mission cruise speed: not a survey parameter, not written by the survey', () => {
    expect('transitSpeed' in defaultSurveyParameters(5)).toBe(false)
    const planner = read('src/views/MissionPlanningView.vue')
    expect(planner).not.toMatch(/missionStore\.defaultCruiseSpeed = parameters/)
    expect(planner).not.toMatch(/key: 'transitSpeed'/)
    // The survey form shows the cruise speed field of the mission itself
    const form = planner.slice(planner.indexOf('class="survey-form'), planner.indexOf('v-if="surveyPreview"'))
    expect(form).toMatch(/v-model\.number="missionStore\.defaultCruiseSpeed"/)
    const calls = planner.match(/planSurvey\(/g) ?? []
    const withCruise = planner.match(/planSurvey\([^;]*?Number\(missionStore\.defaultCruiseSpeed\)/gs) ?? []
    expect(calls.length).toBeGreaterThan(0)
    expect(withCruise).toHaveLength(calls.length)
  })

  test('rows: n = ceil(W/s), centred, so a 10.9 m wide area with s = 5 has 3 lines and no uncovered strip', () => {
    const plan = planSurvey(rectangle(30, 10.9), params({ lineSpacing: 5 }))
    const ys = plan.lines.map(([start]) => toXY(start)[1]).sort((a, b) => a - b)

    expect(ys).toHaveLength(3)
    expect(ys[0]).toBeCloseTo(0.45, 1)
    expect(ys[1]).toBeCloseTo(5.45, 1)
    expect(ys[2]).toBeCloseTo(10.45, 1)
    for (let y = 0; y <= 10.9; y += 0.1) {
      expect(Math.min(...ys.map((line) => Math.abs(line - y)))).toBeLessThanOrEqual(2.5 + 1e-3)
    }
    // An exact multiple of the spacing keeps its count
    expect(planSurvey(rectangle(30, 10), params({ lineSpacing: 5 })).lines).toHaveLength(2)
  })

  test('a non-convex area is flagged so the planner asks to split it', () => {
    expect(planSurvey(u(), params()).nonConvex).toBe(true)
    expect(planSurvey(rectangle(20, 10), params()).nonConvex).toBe(false)
    // A vertex on a straight edge does not make it non-convex
    const withMidpoint = [toLatLon(0, 0), toLatLon(10, 0), toLatLon(20, 0), toLatLon(20, 10), toLatLon(0, 10)]
    expect(planSurvey(withMidpoint, params()).nonConvex).toBe(false)

    const planner = read('src/views/MissionPlanningView.vue')
    expect(planner).toMatch(/v-if="surveyPreview\.nonConvex"/)
    expect(read('src/locales/ru.json')).toMatch(/разбейте район на выпуклые части/)
  })
})

// PX4 v1.17 rover: the acceptance radius is NAV_ACC_RAD for every point, so the form shows it instead of r_turn/r_line
describe('survey form: NAV_ACC_RAD of the vehicle instead of the acceptance radii', () => {
  test('no r_turn and r_line fields; NAV_ACC_RAD from the vehicle with the advice for narrow lines', () => {
    const planner = read('src/views/MissionPlanningView.vue')
    expect(planner).not.toMatch(/key: 'turnRadius'|key: 'lineRadius'/)
    const form = planner.slice(planner.indexOf('class="survey-form'), planner.indexOf('v-if="surveyPreview"'))
    expect(form).toMatch(/vehicleStore\.missionCheckParameters\.acceptanceRadius/)
    expect(form).toMatch(/surveyForm\.navAccRadHint/)
    expect(read('src/locales/ru.json')).toContain(
      'Для узких галсов рекомендуется 1,0 м: лодка останавливается на этом расстоянии от точки поворота'
    )
  })

  test('the stop points of a planned mission are found by their NAV_DELAY', () => {
    const planner = read('src/views/MissionPlanningView.vue')
    const marker = planner.slice(planner.indexOf('const waypointMarkerClass'))
    expect(marker.slice(0, 300)).toMatch(/holdSecondsOf\(/)
  })
})

// SITL PX4 v1.17 rover: A0, the first R and S are on one straight line, so the rover passes R without stopping
// (arrival speed above 0, DifferentialPosControl.cpp) and a NAV_DELAY there only made it creep at v_brake for t_hold
describe('no stop at the first run-in start', () => {
  test('the first R has no NAV_DELAY; every later R and every T has one', () => {
    for (const plan of [
      planSurvey(rectangle(20, 15), params({ lineSpacing: 5 }), 2),
      planSurvey(rectangle(20, 6), params({ lineSpacing: 1 }), 2),
    ]) {
      const holdOf = (i: number): number =>
        plan.waypoints[i].commands.filter((c) => c.command === MavCmd.MAV_CMD_NAV_DELAY).length
      const rs = plan.kinds.flatMap((kind, i) => (kind === 'runInStart' ? [i] : []))
      const ts = plan.kinds.flatMap((kind, i) => (kind === 'runOutEnd' ? [i] : []))
      expect(rs.length).toBeGreaterThan(1)
      expect(holdOf(rs[0])).toBe(0)
      rs.slice(1).forEach((i) => expect(holdOf(i)).toBe(1))
      ts.forEach((i) => expect(holdOf(i)).toBe(1))
    }
  })
})
