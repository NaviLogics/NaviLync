import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'

import { MAVLinkType } from '@/libs/connection/m2r/messages/mavlink2rest-enum'

// The parser and encoder of the Electron connection. No mocks in this file: a mock of 'mavlink2rest-wasm' would
// also catch this import, as it resolves to the same module
type Codec = {
  /** Feed bytes received from the vehicle */
  parser: (input: Uint8Array) => void
  /** Get the messages parsed so far, as mavlink2rest JSON */
  emit: (callback: (json: unknown) => void) => void
  /** Encode a mavlink2rest JSON package into MAVLink bytes */
  rest2mavlink: (input: string) => Uint8Array
}
let codec: Codec

const pack = (message: Record<string, unknown>, systemId = 1): string =>
  JSON.stringify({ header: { system_id: systemId, component_id: 1, sequence: 0 }, message })

const parse = (bytes: Uint8Array): Record<string, unknown>[] => {
  const parsed: Record<string, unknown>[] = []
  codec.parser(bytes)
  codec.emit((json) => parsed.push((typeof json === 'string' ? JSON.parse(json) : json) as Record<string, unknown>))
  return parsed.map((p) => p.message as Record<string, unknown>)
}

// Release 1.0, task 7: the vehicle moves to MAVLink v2 (MAV_PROTO_VER 1 → 2), whose GPS_RAW_INT extensions v1 cut off
describe('MAVLink v2 codec of the Electron connection (mavlink2rest-wasm)', () => {
  beforeAll(async () => {
    const wasm = await import('mavlink2rest-wasm')
    wasm.initSync({
      module: readFileSync(join(process.cwd(), 'node_modules/mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm')),
    })
    codec = new wasm.ParserEmitter() as unknown as Codec
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
})
