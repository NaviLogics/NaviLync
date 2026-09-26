import '@/libs/cosmos'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import type { Stream } from '@/libs/webrtc/signalling_protocol'

// A fake network and a fake Mavlink Camera Manager on BlueOS. While the link is down nothing reaches the server and
// nothing comes back, and the signalling WebSocket does not notice it (a half-open TCP connection, as after pulling
// the Ethernet cable): only a new connection, made once the link is back, reaches the server again.
const network = { up: true, cameraOffersStream: true }
let consumerCount = 0
let sessionCount = 0

const cameraStream = { id: 'producer-1', name: 'UDP Stream' } as unknown as Stream

/**
 * Fake of the signaller: answers right away while the link is up, drops everything while it is down. Its message
 * listeners behave like the real ones: a request's listener stays until an answer of its kind arrives (a lost request
 * leaves it behind, and the next answer then fires every listener waiting for it), negotiation and endSession
 * listeners stay until removed, and all survive a reconnection unless removed.
 */
class FakeSignaller {
  onOpen?: () => void
  reconnects = 0
  endSessionCallbacks = new Map<string, (sessionId: string, reason: string) => void>()
  negotiationListeners = new Set<string>()
  private consumerIdListeners: ((id: string) => void)[] = []
  private sessionIdListeners: ((id: string) => void)[] = []
  private streamsCallback?: (streams: Stream[]) => void

  /**
   * @returns {number} How many message listeners are registered
   */
  messageListeners(): number {
    return (
      this.consumerIdListeners.length +
      this.sessionIdListeners.length +
      this.endSessionCallbacks.size +
      this.negotiationListeners.size +
      (this.streamsCallback ? 1 : 0)
    )
  }

  /**
   * @param {string} type - Event type; only 'message' listeners are modelled
   */
  removeAllListeners(type: string): void {
    if (type !== 'message') return
    this.consumerIdListeners = []
    this.sessionIdListeners = []
    this.endSessionCallbacks.clear()
    this.negotiationListeners.clear()
    this.streamsCallback = undefined
  }

  /**
   * Opens the first connection a moment after being created, like the real one
   * @param {URL} _url - Signalling server address
   * @param {boolean} _shouldReconnect - Whether it reconnects on close
   * @param {() => void} onOpen - Called on every successful (re)connection
   */
  constructor(_url: URL, _shouldReconnect: boolean, onOpen?: () => void) {
    this.onOpen = onOpen
    signallers.push(this)
    setTimeout(() => network.up && this.onOpen?.(), 100)
  }

  /**
   * @param {(id: string) => void} onConsumerId - Called with a new consumer id
   */
  requestConsumerId(onConsumerId: (id: string) => void): void {
    this.consumerIdListeners.push(onConsumerId)
    if (!network.up) return
    const id = `consumer-${++consumerCount}`
    const listeners = this.consumerIdListeners
    this.consumerIdListeners = []
    listeners.forEach((listener) => listener(id))
  }

  /**
   * @param {(streams: Stream[]) => void} onStreams - Called once with the next list of streams
   */
  parseAvailableStreamsAnswer(onStreams: (streams: Stream[]) => void): void {
    this.streamsCallback = onStreams
  }

  /**
   * Answers the pending parseAvailableStreamsAnswer
   */
  requestStreams(): void {
    if (!network.up || !this.streamsCallback) return
    const callback = this.streamsCallback
    this.streamsCallback = undefined
    callback(network.cameraOffersStream ? [cameraStream] : [])
  }

  /**
   * @param {string} _consumerId - Consumer asking
   * @param {string} _producerId - Producer asked for
   * @param {(id: string) => void} onSessionId - Called with a new session id
   */
  requestSessionId(_consumerId: string, _producerId: string, onSessionId: (id: string) => void): void {
    this.sessionIdListeners.push(onSessionId)
    if (!network.up) return
    const id = `session-${++sessionCount}`
    const listeners = this.sessionIdListeners
    this.sessionIdListeners = []
    listeners.forEach((listener) => listener(id))
  }

  /**
   * @param {string} _consumerId - Consumer of the session
   * @param {string} _producerId - Producer of the session
   * @param {string} sessionId - The session
   * @param {(sessionId: string, reason: string) => void} onEnd - Called when the server ends the session
   * @returns {() => void} Removes the listener
   */
  parseEndSessionQuestion(
    _consumerId: string,
    _producerId: string,
    sessionId: string,
    onEnd: (sessionId: string, reason: string) => void
  ): () => void {
    this.endSessionCallbacks.set(sessionId, onEnd)
    return () => this.endSessionCallbacks.delete(sessionId)
  }

  /**
   * Negotiation itself is not simulated, only its listener
   * @param {string} _consumerId - Consumer of the session
   * @param {string} _producerId - Producer of the session
   * @param {string} sessionId - The session
   * @returns {() => void} Removes the listener
   */
  parseNegotiation(_consumerId: string, _producerId: string, sessionId: string): () => void {
    this.negotiationListeners.add(sessionId)
    return () => this.negotiationListeners.delete(sessionId)
  }

  /**
   * A new WebSocket connection: it opens only if the link is up
   */
  reconnect(): void {
    this.reconnects += 1
    if (network.up) setTimeout(() => this.onOpen?.(), 500)
  }

  /**
   * Closing does nothing in the fake
   */
  end(): void {
    return
  }

  /**
   * @returns {boolean} Whether the fake connection is up
   */
  isConnected(): boolean {
    return network.up
  }
}

/**
 * Fake of a WebRTC session: its peer connects a second after it is created, if the link is up; a peer that loses
 * the link fails 30 s later, like Chrome's ICE
 */
class FakeSession {
  id: string
  ended = false
  connected = false
  peerConnection = {}
  onUnreceivableVideo?: (codecs: string[]) => void
  onIncomingICE = (): void => undefined
  onIncomingSDP = (): void => undefined
  private onClose?: (sessionId: string, reason: string) => void

  /**
   * @param {string} id - Session id
   * @param {...unknown} args - The rest of the real Session constructor arguments
   */
  constructor(id: string, ...args: unknown[]) {
    this.id = id
    const onPeerConnected = args[7] as () => void
    this.onClose = args[9] as (sessionId: string, reason: string) => void
    sessions.push(this)
    setTimeout(() => {
      if (!network.up || this.ended) return
      this.connected = true
      onPeerConnected()
    }, 1000)
  }

  /**
   * The link went down under this session
   */
  loseLink(): void {
    this.connected = false
    setTimeout(() => {
      if (this.ended || network.up) return
      this.onClose?.(this.id, 'PeerConnection failed')
      this.end()
    }, 30000)
  }

  /**
   * @returns {boolean} Whether the peer is connected
   */
  isConnected(): boolean {
    return this.connected && !this.ended
  }

  /**
   * Ends the session
   */
  end(): void {
    this.ended = true
    this.connected = false
  }
}

let signallers: FakeSignaller[] = []
let sessions: FakeSession[] = []

vi.mock('@/libs/webrtc/signaller', () => ({ Signaller: FakeSignaller }))
vi.mock('@/libs/webrtc/session', () => ({ Session: FakeSession }))

// The most sessions (RTCPeerConnections) ever open at once, checked every 100 ms
let mostOpenSessions = 0
const openSessions = (): FakeSession[] => sessions.filter((session) => !session.ended)

const advance = async (ms: number): Promise<void> => {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    vi.advanceTimersByTime(100)
    await nextTick()
    mostOpenSessions = Math.max(mostOpenSessions, openSessions().length)
  }
}

const cutLink = (): void => {
  network.up = false
  openSessions().forEach((session) => session.loseLink())
}

// Ten outages of an unstable NV2 link, [down, then up] in ms: long ones that fail the peer, short ones that do not,
// and ones that cut the link again while the reconnection or the negotiation is still under way
const unstableLink: [number, number][] = [
  [120_000, 30_000],
  [20_000, 1_500],
  [45_000, 600],
  [5_000, 20_000],
  [60_000, 3_000],
  [31_000, 800],
  [16_000, 25_000],
  [90_000, 1_200],
  [2_000, 40_000],
  [35_000, 30_000],
]

const runUnstableLink = async (): Promise<void> => {
  for (const [down, up] of unstableLink) {
    cutLink()
    await advance(down)
    network.up = true
    await advance(up)
  }
  await advance(30_000)
}

const latestSession = (): FakeSession | undefined => sessions[sessions.length - 1]

const startVideo = async (): Promise<InstanceType<typeof import('@/composables/webRTC').WebRTCManager>> => {
  const { WebRTCManager } = await import('@/composables/webRTC')
  const { URI } = await import('@/libs/connection/connection')
  const manager = new WebRTCManager(new URI('ws://blueos.local:6021'), {})
  const selectedStream = ref<Stream | undefined>()
  manager.startStream(selectedStream, ref([]), ref([]), ref(0))
  await advance(500)
  selectedStream.value = cameraStream
  await advance(5000)
  expect(latestSession()?.isConnected()).toBe(true)
  return manager
}

describe('WebRTC video comes back on its own after the link to the vehicle was lost (bench, run 56)', () => {
  let manager: Awaited<ReturnType<typeof startVideo>> | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    network.up = true
    network.cameraOffersStream = true
    signallers = []
    sessions = []
    mostOpenSessions = 0
  })

  afterEach(() => {
    manager?.close('test end')
    manager = undefined
    vi.useRealTimers()
  })

  test('after 2 minutes without link, video is back within 30 s of the link returning', async () => {
    manager = await startVideo()
    const sessionBeforeOutage = latestSession()

    network.up = false
    sessionBeforeOutage?.loseLink()
    await advance(120_000)
    network.up = true

    let recoveredAfterMs: number | undefined
    for (let elapsed = 0; elapsed <= 30_000; elapsed += 500) {
      if (latestSession() !== sessionBeforeOutage && latestSession()?.isConnected()) {
        recoveredAfterMs = elapsed
        break
      }
      await advance(500)
    }

    expect(recoveredAfterMs).toBeDefined()
    expect(recoveredAfterMs).toBeLessThanOrEqual(30_000)
  })

  test('when the signalling connection is re-established, a new session is started with a new consumer', async () => {
    manager = await startVideo()
    const oldSession = latestSession()
    const consumersBefore = consumerCount

    signallers[0].onOpen?.()
    await advance(5000)

    expect(consumerCount).toBeGreaterThan(consumersBefore)
    expect(oldSession?.ended).toBe(true)
    expect(latestSession()).not.toBe(oldSession)
    expect(latestSession()?.isConnected()).toBe(true)
  })

  test('a peer connection that failed is replaced by a new session', async () => {
    manager = await startVideo()
    const failedSession = latestSession()

    network.up = false
    failedSession?.loseLink()
    await advance(31_000)
    network.up = true
    await advance(20_000)

    expect(latestSession()).not.toBe(failedSession)
    expect(latestSession()?.isConnected()).toBe(true)
  })

  test('an endSession for an older session does not drop the current one', async () => {
    manager = await startVideo()
    const oldSession = latestSession()!
    signallers[0].onOpen?.()
    await advance(5000)
    const currentSession = latestSession()!
    expect(currentSession).not.toBe(oldSession)

    signallers[0].endSessionCallbacks.get(oldSession.id)?.(oldSession.id, 'late endSession')
    await advance(5000)

    expect(manager.session).toBe(currentSession)
    expect(currentSession.isConnected()).toBe(true)
  })

  test('a short glitch (under 15 s) does not tear the video down', async () => {
    manager = await startVideo()
    const session = latestSession()!

    session.connected = false
    await advance(5000)
    session.connected = true
    await advance(20_000)

    expect(latestSession()).toBe(session)
    expect(signallers[0].reconnects).toBe(0)
  })

  test('a camera that stops offering the stream does not make it reconnect the signalling over and over', async () => {
    manager = await startVideo()
    network.cameraOffersStream = false
    latestSession()?.end()

    await advance(60_000)

    expect(signallers[0].reconnects).toBe(0)
  })

  // NaviLync runs for hours over an unstable NV2 link: a leak of connections there is worse than a black screen
  test('10 outages in a row, also during reconnection: never more than one open connection, old ones closed', async () => {
    manager = await startVideo()

    await runUnstableLink()

    expect(mostOpenSessions).toBe(1)
    expect(openSessions()).toHaveLength(1)
    expect(openSessions()[0]).toBe(latestSession())
    expect(latestSession()?.isConnected()).toBe(true)
    expect(manager.session).toBe(latestSession())
  })

  test('10 outages in a row do not pile up signalling message listeners', async () => {
    manager = await startVideo()
    const listenersWhenStreaming = signallers[0].messageListeners()

    await runUnstableLink()

    expect(latestSession()?.isConnected()).toBe(true)
    expect(signallers[0].messageListeners()).toBeLessThanOrEqual(listenersWhenStreaming + 1)
    expect(signallers[0].negotiationListeners.size).toBe(1)
    expect(signallers[0].endSessionCallbacks.size).toBe(1)
  })

  test('a closed manager does not reconnect anything', async () => {
    manager = await startVideo()
    const sessionsBefore = sessions.length
    manager.close('video no longer shown')
    manager = undefined

    network.up = false
    await advance(60_000)
    network.up = true
    await advance(60_000)

    expect(sessions.length).toBe(sessionsBefore)
    expect(signallers[0].reconnects).toBe(0)
  })
})
