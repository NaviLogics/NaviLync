import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'

import { MAVLinkType } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import type { PX4 } from '@/libs/vehicle/px4/px4'

const sent: unknown[] = []
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))
vi.mock('@/libs/communication/mavlink', async () => ({
  ...(await vi.importActual<typeof import('@/libs/communication/mavlink')>('@/libs/communication/mavlink')),
  sendMavlinkMessage: (message: unknown) => sent.push(message),
}))

// Release 1.0, task 7: the vehicle moves to MAVLink v2 (MAV_PROTO_VER 1 → 2), whose GPS_RAW_INT extensions v1 cut off
// The codec itself is checked in mavlink-v2-codec.test.ts, without the mocks the vehicle needs here
describe('MAVLink v2 in NaviLync', () => {
  test('the GCS HEARTBEAT says MAVLink version 3, as PX4 sends it, not 1', async () => {
    const PX4Class = (await import('@/libs/vehicle/px4/px4')).PX4
    const VehicleType = (await import('@/libs/vehicle/vehicle')).Type
    const vehicle = new PX4Class(VehicleType.Rover, 1) as PX4
    sent.length = 0

    vehicle.sendGcsHeartbeat()

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: MAVLinkType.HEARTBEAT, mavlink_version: 3 })
  })

  test('NaviLync does not set the protocol version anywhere else', () => {
    const sources = ['src/libs/vehicle/mavlink/vehicle.ts', 'src/libs/connection/electron-connection.ts']
    for (const file of sources) {
      expect(readFileSync(join(process.cwd(), file), 'utf8')).not.toMatch(/mavlink_version:\s*1\b|MAVLINK_V1|0xfe/i)
    }
  })
})
