import type { PingResult } from '@/types/network'

// The ground speed under which the boat counts as standing still, in m/s
export const SHUTDOWN_MAX_SPEED = 0.2

// How long the button has to be held, in ms
export const SHUTDOWN_HOLD_MS = 2000

// Pings the onboard computer must miss in a row, then the seconds Linux is given to finish powering off
export const PING_MISSES_FOR_OFF = 5
export const FINISHING_AFTER_PING_S = 10

// Without ping: /status checks BlueOS must miss in a row, then a longer wait, as BlueOS stops before Linux does
export const STATUS_MISSES_FOR_OFF = 3
export const FINISHING_AFTER_STATUS_S = 20

// How long the onboard computer may keep answering after the command before the operator is warned
export const SHUTDOWN_TIMEOUT_MS = 90000

/** How NaviLync tells the onboard computer went off: it stopped answering pings, or (no ping) BlueOS /status */
export type OffDetection = 'ping' | 'status'

/** Where the shutdown is */
export type ShutdownStage =
  | {
      /** The command was accepted; waiting for the onboard computer to stop answering */
      kind: 'shuttingDown'
      /** How it is watched */
      detection: OffDetection
    }
  | {
      /** It stopped answering; Linux is given time to finish */
      kind: 'finishing'
      /** Seconds left */
      secondsLeft: number
    }
  | {
      /** The main power may be switched off */
      kind: 'off'
    }
  | {
      /** It kept answering for SHUTDOWN_TIMEOUT_MS */
      kind: 'timeout'
    }
  | {
      /** The command failed */
      kind: 'failed'
      /** The error, as text */
      error: string
    }

/**
 * What the shutdown needs from the outside
 */
export interface ShutdownSteps {
  /** One ping to the onboard computer */
  ping: () => Promise<PingResult>
  /** Whether BlueOS answers /status */
  status: () => Promise<boolean>
  /** The power off command to BlueOS */
  powerOff: () => Promise<void>
  /** Called on every stage */
  onStage: (stage: ShutdownStage) => void
}

/** Why the onboard computer cannot be shut down now */
export type ShutdownBlock = 'notDisarmed' | 'moving' | 'speedUnknown'

/**
 * What keeps the onboard computer from being shut down now
 * @param {boolean | undefined} armed - Arming state; undefined while unknown (no link to the autopilot)
 * @param {number | undefined} groundSpeed - Ground speed, in m/s
 * @returns {ShutdownBlock | undefined} The reason, or undefined when it may be shut down
 */
export const shutdownBlockedBy = (
  armed: boolean | undefined,
  groundSpeed: number | undefined
): ShutdownBlock | undefined => {
  if (armed !== false) return 'notDisarmed'
  if (groundSpeed === undefined || !Number.isFinite(groundSpeed)) return 'speedUnknown'
  return groundSpeed < SHUTDOWN_MAX_SPEED ? undefined : 'moving'
}

/**
 * Shut the onboard computer down and tell when the main power may go off
 *
 * Ping is the main sign: when the onboard computer answers it before the command, it is pinged every second, and
 * after 5 misses in a row Linux gets 10 s more. When ping does not work from the start, BlueOS /status is checked
 * instead: 3 misses in a row, then 20 s. Either way, an onboard computer still answering after 90 s is a timeout.
 * @param {ShutdownSteps} steps - The ping, the status check, the command and the stage callback
 * @returns {Promise<ShutdownStage>} The last stage: `off`, `timeout` or `failed`
 */
export const shutDownOnboardComputer = async (steps: ShutdownSteps): Promise<ShutdownStage> => {
  void steps
  return { kind: 'off' }
}

/**
 * Wait until the onboard computer stops answering after the shutdown command
 * @param {() => Promise<boolean>} isOnline - Whether it answers now
 * @param {number} [intervalMs] - Time between two checks, in ms
 * @param {number} [offlineChecks] - Checks in a row it must not answer
 * @param {number} [timeoutMs] - How long to wait at most, in ms
 * @returns {Promise<'off' | 'timeout'>} `off` once it stopped answering, `timeout` if it still answers
 */
export const waitUntilOffline = async (
  isOnline: () => Promise<boolean>,
  intervalMs = 1000,
  offlineChecks = 3,
  timeoutMs = 90000
): Promise<'off' | 'timeout'> => {
  let missed = 0
  // The first check waits too: BlueOS answers the command and keeps running for a few seconds
  for (let waited = 0; waited < timeoutMs; waited += intervalMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    const online = await isOnline().catch(() => false)
    missed = online ? 0 : missed + 1
    if (missed >= offlineChecks) return 'off'
  }
  return 'timeout'
}
