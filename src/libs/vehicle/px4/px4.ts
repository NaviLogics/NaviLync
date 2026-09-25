import type { Package } from '@/libs/connection/m2r/messages/mavlink2rest'
import { MAVLinkType, MavModeFlag } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import type { Message } from '@/libs/connection/m2r/messages/mavlink2rest-message'

import * as MAVLinkVehicle from '../mavlink/vehicle'
import * as Vehicle from '../vehicle'

/**
 * Custom modes for PX4
 */
export enum CustomMode {
  // Manual airframe angle with manual throttle
  MANUAL = 1,
  // Altitude control
  ALTCTL = 2,
  // Position control
  POSCTL = 3,
  // Automatic control
  AUTO = 4,
  // Acro Mode
  ACRO = 5,
  // Offboard Mode
  OFFBOARD = 6,
  // Stabilized Mode
  STABILIZED = 7,
  // Rattitude Legacy Mode
  RATTITUDE_LEGACY = 8,
  // Unused, but reserved for future use
  SIMPLE = 9,
  // Termination Mode
  TERMINATION = 10,
}

/**
 * Sub modes of PX4's AUTO main mode
 */
export enum AutoSubMode {
  READY = 1,
  TAKEOFF = 2,
  LOITER = 3,
  MISSION = 4,
  RTL = 5,
  LAND = 6,
}

/** A PX4 mode NaviLync names on screen */
interface NamedPx4Mode {
  /** Name shown to the operator */
  name: string
  /** PX4 main mode (custom_mode bits 16-23) */
  mainMode: CustomMode
  /** PX4 sub mode (custom_mode bits 24-31), 0 when the main mode has none */
  subMode: number
}

// The PX4 modes NaviLync names on screen. Anything else is shown as Unknown(main/sub) rather than guessed.
const namedModes: NamedPx4Mode[] = [
  { name: 'Manual', mainMode: CustomMode.MANUAL, subMode: 0 },
  { name: 'Position', mainMode: CustomMode.POSCTL, subMode: 0 },
  { name: 'Mission', mainMode: CustomMode.AUTO, subMode: AutoSubMode.MISSION },
  { name: 'Hold', mainMode: CustomMode.AUTO, subMode: AutoSubMode.LOITER },
  { name: 'Return', mainMode: CustomMode.AUTO, subMode: AutoSubMode.RTL },
]

/**
 * Name the PX4 mode packed in HEARTBEAT.custom_mode. PX4 stores it as { reserved: uint16, main_mode: uint8,
 * sub_mode: uint8 } (px4_custom_mode.h), so the main mode is in bits 16-23 and the sub mode in bits 24-31.
 * @param {number} customMode HEARTBEAT.custom_mode as sent by PX4
 * @returns {string} One of the named modes, e.g. `Mission` for main 4 / sub 4, or `Unknown(main/sub)`, e.g. `Unknown(4/9)`
 */
export const decodePx4Mode = (customMode: number): string => {
  const mainMode = (customMode >>> 16) & 0xff
  const subMode = (customMode >>> 24) & 0xff
  const namedMode = namedModes.find((mode) => mode.mainMode === mainMode && mode.subMode === subMode)
  return namedMode?.name ?? `Unknown(${mainMode}/${subMode})`
}

/**
 * PX4 vehicle. NaviLync only shows its mode: on the pilot modes are changed on the RC transmitter or in QGC.
 */
export class PX4 extends MAVLinkVehicle.MAVLinkVehicle<string> {
  _mode = 'Unknown'

  protected currentSystemId = 1

  /**
   * Returns the current system ID
   * @returns {number}
   */
  get systemId(): number {
    return this.currentSystemId
  }

  /**
   * Create PX4 vehicle
   * @param {Vehicle.Type} type
   * @param {number} system_id
   */
  constructor(type: Vehicle.Type, system_id: number) {
    super(Vehicle.Firmware.PX4, type, system_id)
    this.currentSystemId = system_id
  }

  /**
   * Get vehicle flight mode
   * @returns {string} The mode decoded from the last HEARTBEAT, e.g. `Mission`
   */
  mode(): string {
    return this._mode
  }

  /**
   * Get a list of the modes NaviLync can name
   * @returns {Map<string, string>} Mode names mapped to themselves, as the mode is reported by name
   */
  modesAvailable(): Map<string, string> {
    return new Map(namedModes.map(({ name }) => [name, name]))
  }

  /**
   * NaviLync does not change the PX4 mode
   * @param {string} mode Requested mode
   * @returns {Promise<void>} Always rejects without sending a command
   */
  setMode(mode: string): Promise<void> {
    return Promise.reject(
      new Error(`NaviLync does not change the PX4 mode (requested ${mode}). Use the RC transmitter or QGC.`)
    )
  }

  /**
   * Decode the PX4 mode from the autopilot's heartbeats
   * @param {Package} mavlink Incoming MAVLink package from the autopilot
   */
  onMAVLinkPackage(mavlink: Package): void {
    if (mavlink.message.type !== MAVLinkType.HEARTBEAT) return

    const heartbeat = mavlink.message as Message.Heartbeat
    if (!(heartbeat.base_mode.bits & MavModeFlag.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED)) return

    this._mode = decodePx4Mode(heartbeat.custom_mode)
    this.onMode.emit()
  }
}
