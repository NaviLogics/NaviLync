import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, test, vi } from 'vitest'

import type { Package } from '@/libs/connection/m2r/messages/mavlink2rest'
import { MAVLinkType } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import type { PX4 } from '@/libs/vehicle/px4/px4'

// The parser and encoder of the Electron connection, loaded from the package files as the app does
type Codec = {
  /** Feed bytes received from the vehicle */
  parser: (input: Uint8Array) => void
  /** Get the messages parsed so far, as mavlink2rest JSON */
  emit: (callback: (json: unknown) => void) => void
  /** Encode a mavlink2rest JSON package into MAVLink bytes */
  rest2mavlink: (input: string) => Uint8Array
}
let codec: Codec
const wasmDir = join(process.cwd(), 'node_modules/mavlink2rest-wasm')

const sent: unknown[] = []
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))
vi.mock('@/libs/communication/mavlink', async () => ({
  ...(await vi.importActual<typeof import('@/libs/communication/mavlink')>('@/libs/communication/mavlink')),
  sendMavlinkMessage: (message: unknown) => sent.push(message),
}))

const pack = (message: Record<string, unknown>, systemId = 1): string =>
  JSON.stringify({ header: { system_id: systemId, component_id: 1, sequence: 0 }, message } as unknown as Package)

const parse = (bytes: Uint8Array): Record<string, unknown>[] => {
  const parsed: Record<string, unknown>[] = []
  codec.parser(bytes)
  codec.emit((json) => parsed.push((typeof json === 'string' ? JSON.parse(json) : json) as Record<string, unknown>))
  return parsed.map((p) => p.message as Record<string, unknown>)
}

// Release 1.0, task 7: the vehicle moves to MAVLink v2 (MAV_PROTO_VER 1 → 2), whose GPS_RAW_INT extensions v1 cut off
describe('MAVLink v2 in NaviLync', () => {
  beforeAll(async () => {
    const wasm = await import(/* @vite-ignore */ join(wasmDir, 'mavlink2rest_wasm.js'))
    wasm.initSync({ module: readFileSync(join(wasmDir, 'mavlink2rest_wasm_bg.wasm')) })
    codec = new wasm.ParserEmitter() as Codec
  })

  test('commands go out as v2 frames (0xFD), unsigned', () => {
    const frame = codec.rest2mavlink(
      pack({
        type: MAVLinkType.COMMAND_LONG,
        target_system: 1,
        target_component: 1,
        command: { type: 'MAV_CMD_DO_SET_MODE' },
        confirmation: 0,
        param1: 1,
        param2: 4,
        param3: 4,
        param4: 0,
        param5: 0,
        param6: 0,
        param7: 0,
      })
    )
    expect(frame[0]).toBe(0xfd)
    // incompat_flags: bit 0 would mean a signed frame, with 13 more bytes after the checksum
    expect(frame[2] & 0x01).toBe(0)
    expect(frame.length).toBe(12 + frame[1])
  })

  test('GPS_RAW_INT with its v2 extensions (h_acc, v_acc, alt_ellipsoid) is parsed', () => {
    const frame = codec.rest2mavlink(
      pack({
        type: MAVLinkType.GPS_RAW_INT,
        time_usec: 123,
        lat: 557_500_000,
        lon: 376_000_000,
        alt: 150_000,
        eph: 70,
        epv: 120,
        vel: 185,
        cog: 9000,
        fix_type: { type: 'GPS_FIX_TYPE_RTK_FIXED' },
        satellites_visible: 28,
        alt_ellipsoid: 165_000,
        h_acc: 23,
        v_acc: 41,
        vel_acc: 5,
        hdg_acc: 0,
        yaw: 0,
      })
    )
    const [message] = parse(frame)
    expect(message).toMatchObject({ type: 'GPS_RAW_INT', vel: 185, h_acc: 23, v_acc: 41, alt_ellipsoid: 165_000 })
    expect(message.fix_type).toEqual({ type: 'GPS_FIX_TYPE_RTK_FIXED' })
  })

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
