import { MavCmd, MAVLinkType } from '@/libs/connection/m2r/messages/mavlink2rest-enum'

// Until a vehicle tells it is disarmed, no reboot goes out
let isRebootAllowedNow: () => boolean = () => false

/**
 * What NaviLync needs to know about an outgoing MAVLink message to tell an autopilot reboot apart
 */
export interface OutgoingMessage {
  /** The MAVLink message type, e.g. 'COMMAND_LONG' */
  type: string
  /** COMMAND_LONG.command, as mavlink2rest encodes it */
  command?: {
    /** The MAV_CMD name */
    type: string
  }
  /** COMMAND_LONG.param1 */
  param1?: number
}

/**
 * Whether a message asks the autopilot to reboot or shut down
 * @param {OutgoingMessage} message - The message to be sent
 * @returns {boolean} True for MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN acting on the autopilot
 */
export const isAutopilotRebootCommand = (message: OutgoingMessage): boolean =>
  message.type === MAVLinkType.COMMAND_LONG &&
  message.command?.type === MavCmd.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN &&
  // param1 0 does nothing to the autopilot; 1 reboots it, 2 shuts it down, 3 reboots into the bootloader
  (message.param1 ?? 0) !== 0

/**
 * Whether the autopilot may be rebooted from NaviLync
 * @param {boolean | undefined} isArmed - Whether the vehicle is armed; undefined when unknown
 * @returns {boolean} True only for a vehicle known to be disarmed
 */
export const isAutopilotRebootAllowed = (isArmed: boolean | undefined): boolean => isArmed === false

/**
 * Set what tells whether a reboot command may go out now; the main vehicle store sets it
 * @param {() => boolean} isAllowed - True when the autopilot may be rebooted
 */
export const setAutopilotRebootGuard = (isAllowed: () => boolean): void => {
  isRebootAllowedNow = isAllowed
}

/**
 * Whether an outgoing message must be held back: a reboot command while a reboot is not allowed
 * @param {OutgoingMessage} message - The message to be sent
 * @returns {boolean} True when the message must not be sent
 */
export const isBlockedAutopilotReboot = (message: OutgoingMessage): boolean =>
  isAutopilotRebootCommand(message) && !isRebootAllowedNow()
