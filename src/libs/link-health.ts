import type { OffDetection } from '@/libs/vehicle/onboard-shutdown'

/** How the link to the autopilot looks from its HEARTBEAT */
export type LinkHealth = 'ok' | 'degraded' | 'lost' | 'none'

// HEARTBEAT age limits: up to 2 s is normal (PX4 sends 1 Hz), over 5 s PX4 itself gives the GCS up (COM_DL_LOSS_T = 5)
export const LINK_DEGRADED_AFTER_MS = 2000
export const LINK_LOST_AFTER_MS = 5000

/**
 * The state of the link from the age of the last autopilot HEARTBEAT
 * @param {number | undefined} heartbeatAgeMs - How long ago the last HEARTBEAT arrived; undefined when none did
 * @returns {LinkHealth} 'ok' under 2 s, 'degraded' from 2 to 5 s, 'lost' over 5 s, 'none' without any HEARTBEAT
 */
export const linkHealth = (heartbeatAgeMs: number | undefined): LinkHealth => {
  if (heartbeatAgeMs === undefined) return 'none'
  if (heartbeatAgeMs > LINK_LOST_AFTER_MS) return 'lost'
  if (heartbeatAgeMs >= LINK_DEGRADED_AFTER_MS) return 'degraded'
  return 'ok'
}

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
    if (lastHeartbeatAt === undefined) return
    const state = linkHealth(now - lastHeartbeatAt)
    const current = this.outages[this.outages.length - 1]
    const ongoing = current !== undefined && !current.ended ? current : undefined

    if (state === 'ok') {
      this.contextWhenDegraded = undefined
      if (ongoing) {
        ongoing.ended = true
        ongoing.durationMs = lastHeartbeatAt - ongoing.startedAt
      }
      return
    }

    // The store forgets the arming state once the vehicle is offline, so the context is taken when the link
    // starts to go bad
    this.contextWhenDegraded ??= { ...context }
    if (state !== 'lost') return

    if (ongoing) {
      ongoing.durationMs = now - ongoing.startedAt
      return
    }
    this.outages.push({
      startedAt: lastHeartbeatAt,
      durationMs: now - lastHeartbeatAt,
      ended: false,
      context: this.contextWhenDegraded,
    })
  }

  private contextWhenDegraded: LinkContext | undefined
}

/**
 * The onboard computer shutdown, as the journal keeps it
 */
export interface OnboardShutdownEvent {
  /** The onboard computer shutdown */
  kind: 'onboardShutdown'
  /** The command was sent, the onboard computer went off, it kept answering, or the command failed */
  stage: 'commandSent' | 'off' | 'timeout' | 'failed'
  /** How NaviLync told the onboard computer went off */
  detection?: OffDetection
  /** The error of a failed command */
  error?: string
}

/**
 * The battery voltage under 3.5 V per cell for over 3 s, and back over it
 */
export interface LowVoltageEvent {
  /** The battery voltage */
  kind: 'lowVoltage'
  /** It went under the threshold, or came back over it */
  stage: 'started' | 'ended'
  /** The voltage then, in V */
  voltage: number
  /** The threshold: the cells times 3.5 V */
  threshold: number
  /** BAT1_N_CELLS */
  cells: number
}

/** What an event of the session holds, before it gets its time */
export type SessionEventData = OnboardShutdownEvent | LowVoltageEvent

/**
 * An event of the session the operator should find later in the journal, next to the link losses
 */
export type SessionEvent = SessionEventData & {
  /** When it happened, as epoch milliseconds */
  at: number
}
