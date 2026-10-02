import { beforeAll, describe, expect, test, vi } from 'vitest'

import type { Package } from '@/libs/connection/m2r/messages/mavlink2rest'
import { GpsFixType, MAVLinkType } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import type { Message } from '@/libs/connection/m2r/messages/mavlink2rest-message'
import type { PX4 } from '@/libs/vehicle/px4/px4'

// The WASM MAVLink parser cannot load under vitest and is not needed to feed packets to the vehicle directly.
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))

let PX4Class: typeof PX4
let VehicleType: typeof import('@/libs/vehicle/vehicle').Type

// GPS_RAW_INT as mavlink2rest sends it; a MAVLink v1 message comes with the extension fields zeroed
const gpsRawInt = (fixType: GpsFixType, extensions: Partial<Message.GpsRawInt> = {}): Uint8Array => {
  const message = {
    type: MAVLinkType.GPS_RAW_INT,
    time_usec: 123,
    lat: 557_000_000,
    lon: 376_000_000,
    alt: 150_000,
    eph: 70,
    epv: 120,
    vel: 185,
    cog: 9000,
    fix_type: { type: fixType },
    satellites_visible: 28,
    alt_ellipsoid: 0,
    h_acc: 0,
    v_acc: 0,
    vel_acc: 0,
    hdg_acc: 0,
    yaw: 0,
    ...extensions,
  } as unknown as Message.GpsRawInt
  const pack: Package = { header: { system_id: 1, component_id: 1, sequence: 0 }, message }
  return new TextEncoder().encode(JSON.stringify(pack))
}

// Release 1.0, tasks 4 and 7
describe('GPS_RAW_INT in the vehicle GPS status (the one the header shows)', () => {
  beforeAll(async () => {
    PX4Class = (await import('@/libs/vehicle/px4/px4')).PX4
    VehicleType = (await import('@/libs/vehicle/vehicle')).Type
  })

  test('the fix type number and the time it arrived in NaviLync are kept', () => {
    const vehicle = new PX4Class(VehicleType.Rover, 1)
    const before = performance.now()

    vehicle.onIncomingMessage(gpsRawInt(GpsFixType.GPS_FIX_TYPE_RTK_FIXED))

    expect(vehicle.statusGPS().fixTypeNumber).toBe(6)
    expect(vehicle.statusGPS().receivedAt).toBeGreaterThanOrEqual(before)
    expect(vehicle.statusGPS().receivedAt).toBeLessThanOrEqual(performance.now())
  })

  test('RTK float is 5', () => {
    const vehicle = new PX4Class(VehicleType.Rover, 1)
    vehicle.onIncomingMessage(gpsRawInt(GpsFixType.GPS_FIX_TYPE_RTK_FLOAT))
    expect(vehicle.statusGPS().fixTypeNumber).toBe(5)
  })

  test('MAVLink v2: h_acc (mm) and the other extensions are read; h_acc is kept in cm', () => {
    const vehicle = new PX4Class(VehicleType.Rover, 1)
    vehicle.onIncomingMessage(
      gpsRawInt(GpsFixType.GPS_FIX_TYPE_RTK_FIXED, { h_acc: 23, v_acc: 41, alt_ellipsoid: 165_000 })
    )
    expect(vehicle.statusGPS().horizontalAccuracyCm).toBeCloseTo(2.3)
  })

  test('MAVLink v1 (extensions cut, h_acc 0): no accuracy rather than a perfect 0 cm', () => {
    const vehicle = new PX4Class(VehicleType.Rover, 1)
    vehicle.onIncomingMessage(gpsRawInt(GpsFixType.GPS_FIX_TYPE_RTK_FIXED))
    expect(vehicle.statusGPS().horizontalAccuracyCm).toBeUndefined()
  })
})
