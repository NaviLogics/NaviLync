import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, test, vi } from 'vitest'

import { MAVLinkType } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import type { PX4 } from '@/libs/vehicle/px4/px4'

const sent: unknown[] = []
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))
vi.mock('@/libs/communication/mavlink', async () => ({
  ...(await vi.importActual<typeof import('@/libs/communication/mavlink')>('@/libs/communication/mavlink')),
  sendMavlinkMessage: (message: unknown) => sent.push(message),
}))

let PX4Class: typeof PX4
let VehicleType: typeof import('@/libs/vehicle/vehicle').Type
const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')

// Release 1.0, task 2: the mission check needs RO_SPEED_LIM and NAV_ACC_RAD from the vehicle
describe('vehicle parameters for the mission check', () => {
  beforeAll(async () => {
    PX4Class = (await import('@/libs/vehicle/px4/px4')).PX4
    VehicleType = (await import('@/libs/vehicle/vehicle')).Type
  })

  test('one parameter is asked for by name (PARAM_REQUEST_READ, param_index -1)', () => {
    const vehicle = new PX4Class(VehicleType.Rover, 1)
    sent.length = 0

    vehicle.requestParameter('RO_SPEED_LIM')

    expect(sent).toHaveLength(1)
    const message = sent[0] as {
      /**
       *
       */
      type: string
      /**
       *
       */
      param_id: string[]
      /**
       *
       */
      param_index: number
      /**
       *
       */
      target_system: number
    }
    expect(message.type).toBe(MAVLinkType.PARAM_REQUEST_READ)
    expect(message.param_index).toBe(-1)
    expect(message.target_system).toBe(1)
    expect(message.param_id.join('').replace(/\0/g, '')).toBe('RO_SPEED_LIM')
    expect(message.param_id).toHaveLength(16)
  })

  test('the store asks for RO_SPEED_LIM and NAV_ACC_RAD when a vehicle connects and keeps them', () => {
    const store = read('src/stores/mainVehicle.ts')
    expect(store).toMatch(/requestParameter\(name\)/)
    expect(store).toMatch(/\['RO_SPEED_LIM', 'NAV_ACC_RAD'\]/)
    expect(store).toMatch(/missionCheckParameters/)
  })

  test('the planner checks the mission before uploading it', () => {
    const planner = read('src/views/MissionPlanningView.vue')
    const upload = planner.slice(planner.indexOf('const uploadMissionToVehicle = async'))
    expect(upload.indexOf('validateMission(')).toBeGreaterThan(-1)
    expect(upload.indexOf('validateMission(')).toBeLessThan(upload.indexOf('vehicleStore.uploadMission('))
  })
})
