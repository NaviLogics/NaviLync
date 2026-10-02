import { afterEach, describe, expect, test, vi } from 'vitest'

import { MavCmd, MAVLinkType } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import {
  AutopilotRebootBlockedError,
  isAutopilotRebootAllowed,
  isAutopilotRebootCommand,
  isBlockedAutopilotReboot,
  setAutopilotRebootGuard,
} from '@/libs/vehicle/autopilot-reboot'

const write = vi.fn()
const openSnackbar = vi.fn()
vi.mock('@/composables/snackbar', () => ({ openSnackbar: (...args: unknown[]) => openSnackbar(...args) }))
vi.mock('@/libs/connection/connection-manager', () => ({
  ConnectionManager: { write: (data: Uint8Array) => write(data) },
}))

const reboot = {
  type: MAVLinkType.COMMAND_LONG,
  command: { type: MavCmd.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN },
  param1: 1,
}

// Release 1.0, task 5: after a software reboot the Pixhawk hung until its power was removed
describe('autopilot reboot only for a disarmed vehicle', () => {
  afterEach(() => {
    setAutopilotRebootGuard(() => false)
    write.mockClear()
  })

  test('MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN with param1 1 (reboot) or 2 (shutdown) is a reboot command', () => {
    expect(isAutopilotRebootCommand(reboot)).toBe(true)
    expect(isAutopilotRebootCommand({ ...reboot, param1: 2 })).toBe(true)
  })

  test('param1 0 (no action on the autopilot) and other commands are not', () => {
    expect(isAutopilotRebootCommand({ ...reboot, param1: 0 })).toBe(false)
    expect(isAutopilotRebootCommand({ ...reboot, command: { type: MavCmd.MAV_CMD_COMPONENT_ARM_DISARM } })).toBe(false)
    expect(isAutopilotRebootCommand({ type: MAVLinkType.HEARTBEAT })).toBe(false)
  })

  test('allowed only when the vehicle is known to be disarmed', () => {
    expect(isAutopilotRebootAllowed(false)).toBe(true)
    expect(isAutopilotRebootAllowed(true)).toBe(false)
    expect(isAutopilotRebootAllowed(undefined)).toBe(false)
  })

  test('a reboot from a custom MAVLink action is not sent while armed, and is sent while disarmed', async () => {
    const { sendMavlinkMessage } = await import('@/libs/communication/mavlink')

    setAutopilotRebootGuard(() => false)
    expect(isBlockedAutopilotReboot(reboot)).toBe(true)
    expect(() => sendMavlinkMessage(reboot as never)).toThrow(AutopilotRebootBlockedError)
    expect(write).not.toHaveBeenCalled()

    setAutopilotRebootGuard(() => true)
    expect(isBlockedAutopilotReboot(reboot)).toBe(false)
    sendMavlinkMessage(reboot as never)
    expect(write).toHaveBeenCalledTimes(1)
  })

  // Review of #36
  test('COMMAND_INT carrying the reboot is caught as well', () => {
    const asInt = { ...reboot, type: MAVLinkType.COMMAND_INT }
    expect(isAutopilotRebootCommand(asInt)).toBe(true)
    setAutopilotRebootGuard(() => false)
    expect(isBlockedAutopilotReboot(asInt)).toBe(true)
  })

  test('param1 3 (reboot into the bootloader) is a reboot command too', () => {
    expect(isAutopilotRebootCommand({ ...reboot, param1: 3 })).toBe(true)
  })

  test('a held back reboot is not silent: the operator is told why, and the sender gets a clear error', async () => {
    const { sendMavlinkMessage } = await import('@/libs/communication/mavlink')
    setAutopilotRebootGuard(() => false)
    openSnackbar.mockClear()

    let error: unknown
    try {
      sendMavlinkMessage(reboot as never)
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(AutopilotRebootBlockedError)
    expect((error as Error).message).not.toMatch(/timeout|acknowledg/i)
    expect(openSnackbar).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }))
  })

  test('other messages always go out', async () => {
    const { sendMavlinkMessage } = await import('@/libs/communication/mavlink')
    setAutopilotRebootGuard(() => false)
    sendMavlinkMessage({ type: MAVLinkType.HEARTBEAT } as never)
    expect(write).toHaveBeenCalledTimes(1)
  })
})
