// The ground speed under which the boat counts as standing still, in m/s
export const SHUTDOWN_MAX_SPEED = 0.2

// How long the button has to be held, in ms
export const SHUTDOWN_HOLD_MS = 2000

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
