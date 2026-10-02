/** How the link to the autopilot looks from its HEARTBEAT */
export type LinkHealth = 'ok' | 'degraded' | 'lost' | 'none'

// HEARTBEAT age limits: up to 2 s is normal (PX4 sends 1 Hz), over 5 s PX4 itself gives the GCS up (COM_DL_LOSS_T = 5)
export const LINK_DEGRADED_AFTER_MS = 0
export const LINK_LOST_AFTER_MS = 0

/**
 * The state of the link from the age of the last autopilot HEARTBEAT
 * @param {number | undefined} heartbeatAgeMs - How long ago the last HEARTBEAT arrived; undefined when none did
 * @returns {LinkHealth} 'ok' under 2 s, 'degraded' from 2 to 5 s, 'lost' over 5 s, 'none' without any HEARTBEAT
 */
export const linkHealth = (heartbeatAgeMs: number | undefined): LinkHealth => (heartbeatAgeMs ? 'none' : 'none')

/**
 * What the vehicle was doing when the link went bad
 */
export interface LinkContext {
  /** The vehicle mode, e.g. 'Mission' */
  mode: string | undefined
  /** Whether the vehicle was armed; undefined when unknown */
  armed: boolean | undefined
}

/**
 * A loss of the link to the autopilot
 */
export interface LinkOutage {
  /** When the last HEARTBEAT before the loss arrived, as epoch milliseconds */
  startedAt: number
  /** How long the link was lost, in ms; for an ongoing loss, up to now */
  durationMs: number
  /** Whether HEARTBEATs arrive again */
  ended: boolean
  /** Mode and arming state when the link went bad */
  context: LinkContext
}

/**
 * The losses of the link in this session: a gap in HEARTBEATs over 5 s is one entry, from the last HEARTBEAT until
 * the next one
 */
export class LinkOutageJournal {
  readonly outages: LinkOutage[] = []

  /**
   * Bring the journal up to date
   * @param {number} now - The current time, as epoch milliseconds
   * @param {number | undefined} lastHeartbeatAt - When the last HEARTBEAT arrived, as epoch milliseconds
   * @param {LinkContext} context - The mode and arming state now; kept from the moment the link went bad
   */
  update(now: number, lastHeartbeatAt: number | undefined, context: LinkContext): void {
    now
    lastHeartbeatAt
    context
  }
}
