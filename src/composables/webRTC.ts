/* eslint-disable jsdoc/no-undefined-types */ // TODO: Fix RTCConfiguration is unknown

import { type Ref, ref, watch } from 'vue'

import * as Connection from '@/libs/connection/connection'
import { setJitterBufferTarget } from '@/libs/webrtc/jitter-buffer'
import { Session } from '@/libs/webrtc/session'
import { Signaller } from '@/libs/webrtc/signaller'
import type { Stream } from '@/libs/webrtc/signalling_protocol'

/**
 *
 */
interface startStreamReturn {
  /**
   * MediaStream object, if WebRTC stream is chosen
   */
  mediaStream: Ref<MediaStream | undefined>
  /**
   * Connection state
   */
  connected: Ref<boolean>
  /**
   * Current status of the signalling
   */
  signallerStatus: Ref<string>
  /**
   * Current status of the stream
   */
  streamStatus: Ref<string>
}

/**
 *
 */
export class WebRTCManager {
  public availableStreams: Ref<Array<Stream>> = ref(new Array<Stream>())
  public availableICEIPs: Ref<Array<string>> = ref(new Array<string>())
  private mediaStream: Ref<MediaStream | undefined> = ref()
  public signallerStatus: Ref<string> = ref('waiting...')
  public streamStatus: Ref<string> = ref('waiting...')
  private connected = ref(false)
  private consumerId: string | undefined
  private streamName: string | undefined
  public session: Session | undefined
  public onUnreceivableVideo?: (codecs: string[]) => void
  private rtcConfiguration: RTCConfiguration
  private selectedICEIPs: string[] = []
  private selectedICEProtocols: string[] = []
  private JitterBufferTarget = 0

  // Set only by close(): the manager is done and must not start anything again. A stopped session is not an end.
  private hasEnded = false
  private signaller: Signaller
  private waitingForAvailableStreamsAnswer = false
  private waitingForSessionStart = false
  private waitingForConsumerId = false
  // Removes the signalling listeners of the current session; the negotiation one is never removed otherwise
  private removeSessionListeners: (() => void)[] = []
  private lastTimeHealthy = Date.now()
  private lastStreamsAnswerTime = 0
  private healthWatchdog: ReturnType<typeof setInterval>

  /**
   *
   * @param {Connection.URI} webRTCSignallingURI
   * @param {RTCConfiguration} rtcConfiguration
   */
  constructor(webRTCSignallingURI: Connection.URI, rtcConfiguration: RTCConfiguration) {
    console.debug('[WebRTC] Trying to connect to signalling server.')
    this.rtcConfiguration = rtcConfiguration
    this.signaller = new Signaller(
      webRTCSignallingURI,
      true,
      (): void => this.onSignallerOpen(),
      (status: string): void => this.updateSignallerStatus(status)
    )
    this.healthWatchdog = setInterval(() => this.checkHealth(), WebRTCManager.healthCheckIntervalMs)
  }

  // A stream that is selected but has had no connected peer for this long is reconnected from scratch. After a link
  // loss the signalling WebSocket can stay half-open without ever closing, so nothing else would notice.
  private static readonly reconnectAfterUnhealthyMs = 15000
  private static readonly healthCheckIntervalMs = 2000
  // The list of streams is asked for every second, so a longer silence means the signalling is not getting through
  private static readonly signallingSilenceMs = 5000

  /**
   * Reconnects the signalling when a selected stream has had no connected peer for too long; the reconnection then
   * starts a new session (see onSignallerOpen)
   */
  private checkHealth(): void {
    // A signalling server that answers but does not offer the stream (e.g. camera off) is not helped by reconnecting
    const signallingAnswers = Date.now() - this.lastStreamsAnswerTime < WebRTCManager.signallingSilenceMs
    const streamOffered = this.availableStreams.value.some((stream) => stream.name === this.streamName)
    if (
      this.hasEnded ||
      this.streamName === undefined ||
      this.session?.isConnected() ||
      (signallingAnswers && !streamOffered)
    ) {
      this.lastTimeHealthy = Date.now()
      return
    }
    if (Date.now() - this.lastTimeHealthy < WebRTCManager.reconnectAfterUnhealthyMs) return

    this.lastTimeHealthy = Date.now()
    const msg = `No video for ${
      WebRTCManager.reconnectAfterUnhealthyMs / 1000
    } s, reconnecting to the signalling server`
    console.warn('[WebRTC] ' + msg)
    this.updateStreamStatus(msg)
    this.signaller.reconnect()
  }

  /**
   * Called on every (re)connection of the signalling WebSocket. The signalling server forgets the consumer and the
   * sessions of a closed connection, so after a reconnection both are requested again.
   */
  private onSignallerOpen(): void {
    if (this.hasEnded) return

    this.stopSession('Signalling (re)connected')
    // Listeners of requests made on the old connection would wait forever, or all fire on the next answer
    this.signaller.removeAllListeners('message', true)
    this.waitingForAvailableStreamsAnswer = false
    this.consumerId = undefined
    this.waitingForConsumerId = false
    this.startConsumer()
    if (this.streamName !== undefined) this.startSession()
  }

  /**
   *
   * @param {string} reason
   */
  public close(reason: string): void {
    this.hasEnded = true
    clearInterval(this.healthWatchdog)
    this.signaller.onOpen = undefined
    this.stopSession(reason)
    this.signaller.end(reason)
  }

  /**
   *
   * @param { Ref<Stream | undefined> } selectedStream - Stream to receive stream from
   * @param { Ref<string[]> } selectedICEIPs - ICE IPs allowed to be used in the connection
   * @param { Ref<string[]> } selectedICEProtocols - ICE protocols allowed to be used in the connection
   * @param { Ref<number | null> } jitterBufferTarget - RTP receiver jitter buffer target in milliseconds
   * @returns { startStreamReturn }
   */
  public startStream(
    selectedStream: Ref<Stream | undefined>,
    selectedICEIPs: Ref<string[]>,
    selectedICEProtocols: Ref<string[]>,
    jitterBufferTarget: Ref<number>
  ): startStreamReturn {
    this.selectedICEIPs = selectedICEIPs.value
    this.selectedICEProtocols = selectedICEProtocols.value
    this.JitterBufferTarget = jitterBufferTarget.value

    watch(selectedStream, (newStream, oldStream) => {
      if (newStream?.id === oldStream?.id) {
        return
      }

      const msg = `Selected stream changed from "${oldStream?.id}" to "${newStream?.id}".`
      console.debug('[WebRTC] ' + msg)
      if (oldStream !== undefined) {
        this.stopSession(msg)
      }
      if (newStream !== undefined) {
        this.streamName = newStream.name
        this.startSession()
      }
    })

    watch(selectedICEIPs, (newIps, oldIps) => {
      if (newIps === oldIps) {
        return
      }

      const msg = `Selected IPs changed from "${oldIps}" to "${newIps}".`
      console.debug('[WebRTC] ' + msg)

      this.selectedICEIPs = newIps

      if (this.streamName !== undefined) {
        this.stopSession(msg)
      }

      if (this.streamName !== undefined) {
        this.startSession()
      }
    })

    watch(selectedICEProtocols, (newProtocols, oldProtocols) => {
      if (newProtocols === oldProtocols) {
        return
      }

      const msg = `Selected Protocols changed from "${oldProtocols}" to "${newProtocols}".`
      console.debug('[WebRTC] ' + msg)

      this.selectedICEProtocols = newProtocols

      if (this.streamName !== undefined) {
        this.stopSession(msg)
      }

      if (this.streamName !== undefined) {
        this.startSession()
      }
    })

    return {
      mediaStream: this.mediaStream,
      connected: this.connected,
      signallerStatus: this.signallerStatus,
      streamStatus: this.streamStatus,
    }
  }

  /**
   *
   * @param {string} newStatus
   */
  private updateStreamStatus(newStatus: string): void {
    const time = new Date().toTimeString().split(' ').first()
    this.streamStatus.value = `${newStatus} (${time})`
  }

  /**
   *
   * @param {string} newStatus
   */
  private updateSignallerStatus(newStatus: string): void {
    const time = new Date().toTimeString().split(' ').first()
    this.signallerStatus.value = `${newStatus} (${time})`
  }

  /**
   *
   */
  private startConsumer(): void {
    if (this.hasEnded) return

    // Requests a new consumer ID, one request at a time
    if (this.consumerId === undefined && !this.waitingForConsumerId) {
      this.waitingForConsumerId = true
      this.signaller.requestConsumerId((newConsumerId: string): void => {
        this.waitingForConsumerId = false
        this.consumerId = newConsumerId
      })
    }

    this.availableStreams.value = []
    this.updateStreamsAvailable()
  }

  /**
   *
   */
  private updateStreamsAvailable(): void {
    if (this.waitingForAvailableStreamsAnswer) {
      this.signaller.requestStreams()
      return
    }
    if (this.hasEnded) {
      this.waitingForAvailableStreamsAnswer = false
      return
    }
    this.waitingForAvailableStreamsAnswer = true

    // Asks for available streams, which will trigger the consumer "onAvailableStreams" callback
    window.setTimeout(() => {
      // Register the parser to update the list of streams when the signaller receives the answer
      this.signaller.parseAvailableStreamsAnswer((availableStreams): void => {
        if (!this.waitingForAvailableStreamsAnswer) {
          return
        }
        this.waitingForAvailableStreamsAnswer = false
        this.availableStreams.value = availableStreams
        this.lastStreamsAnswerTime = Date.now()

        this.updateStreamsAvailable()
      })

      this.signaller.requestStreams()
    }, 1000)
  }

  /**
   *
   * @param {RTCTrackEvent} event
   */
  private onTrackAdded(event: RTCTrackEvent): void {
    const [remoteStream] = event.streams
    this.mediaStream.value = remoteStream

    if (this.session?.peerConnection) {
      setJitterBufferTarget(this.session.peerConnection, this.JitterBufferTarget)
    }

    // Assign 'motion' contentHint to media stream video tracks, so it performs better on low bandwith situations
    // More on that here: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/contentHint
    const videoTracks = this.mediaStream.value.getVideoTracks().filter((t) => t.kind === 'video')
    videoTracks.forEach((track) => {
      if (!('contentHint' in track)) {
        console.error('MediaStreamTrack contentHint attribute not supported.')
        return
      }
      track.contentHint = 'motion'
    })

    console.debug('[WebRTC] Track added')
    console.debug('Event:', event)
    console.debug('Settings:', event.track.getSettings?.())
    console.debug('Constraints:', event.track.getConstraints?.())
    console.debug('Capabilities:', event.track.getCapabilities?.())
  }

  /**
   * Called when a peer is connected
   */
  private onPeerConnected(): void {
    this.connected.value = true
  }

  /**
   * Terminates the RTCPeerConnection but preserves the signaller for reconnects
   */
  public endAllSessions(): void {
    if (this.session) {
      this.session.end()
    }
  }

  /**
   *
   * @param {Stream} stream
   * @param {string} consumerId
   */
  private requestSession(stream: Stream, consumerId: string): void {
    console.debug(`[WebRTC] Requesting stream:`, stream)

    // Requests a new Session ID
    this.signaller.requestSessionId(consumerId, stream.id, (receivedSessionId: string): void => {
      this.onSessionIdReceived(stream, stream.id, receivedSessionId)
    })
  }

  /**
   *
   */
  private startSession(): void {
    if (this.hasEnded) return
    if (this.waitingForSessionStart) {
      return
    }
    this.waitingForSessionStart = true

    window.setTimeout(() => {
      if (!this.waitingForSessionStart || this.hasEnded) {
        this.waitingForSessionStart = false
        return
      }

      const stream = this.availableStreams.value.find((s) => {
        return s.name === this.streamName
      })
      if (stream === undefined) {
        const error = `Failed to start a new Session with "${this.streamName}". Reason: not available`
        console.error('[WebRTC] ' + error)
        this.updateStreamStatus(error)

        this.waitingForSessionStart = false
        this.startSession()
        return
      }

      const msg = `Starting session with producer "${stream.id}" ("${this.streamName}")`
      this.updateStreamStatus(msg)
      console.debug('[WebRTC] ' + msg)

      if (this.consumerId === undefined) {
        const error =
          'Failed to start a new Session with producer' +
          `"${stream.id}" ("${this.streamName}"). Reason: undefined consumerId`
        console.error('[WebRTC] ' + error)
        this.updateStreamStatus(error)

        this.startConsumer()
        this.startSession()
        return
      }

      this.requestSession(stream, this.consumerId)

      this.waitingForSessionStart = false
    }, 1000)
  }

  /**
   *
   * @param {string} reason
   */
  private onSessionClosed(reason: string): void {
    this.stopSession(reason)
    this.consumerId = undefined
    this.startConsumer()
    this.startSession()
  }

  /**
   *
   * @param {Stream} stream
   * @param {string} producerId
   * @param {string} receivedSessionId
   */
  private onSessionIdReceived(stream: Stream, producerId: string, receivedSessionId: string): void {
    if (this.hasEnded) return
    // Two restarts can overlap (e.g. a reconnection and a stream change); only the newest session is kept
    this.stopSession(`Replaced by session ${receivedSessionId}`)

    // Create a new Session with the received Session ID
    this.session = new Session(
      receivedSessionId,
      this.consumerId!,
      stream,
      this.signaller,
      this.rtcConfiguration,
      this.selectedICEIPs,
      this.selectedICEProtocols,
      (event: RTCTrackEvent): void => this.onTrackAdded(event),
      (): void => this.onPeerConnected(),
      (availableICEIPs: string[]) => (this.availableICEIPs.value = availableICEIPs),
      (_sessionId, reason) => this.onSessionClosed(reason),
      (status: string): void => this.updateStreamStatus(status)
    )

    this.session.onUnreceivableVideo = (codecs: string[]): void => this.onUnreceivableVideo?.(codecs)

    // Registers Session callback for the Signaller endSession parser
    const removeEndSessionListener = this.signaller.parseEndSessionQuestion(
      this.consumerId!,
      producerId,
      this.session.id,
      (sessionId, reason) => {
        console.debug(`[WebRTC] Session ${sessionId} ended. Reason: ${reason}`)
        // A late endSession for a session already replaced must not drop the current one
        if (this.session?.id !== sessionId) return
        this.stopSession(reason)
        this.startSession()
      }
    )

    // Registers Session callbacks for the Signaller Negotiation parser
    const removeNegotiationListener = this.signaller.parseNegotiation(
      this.consumerId!,
      producerId,
      this.session.id,
      this.session.onIncomingICE.bind(this.session),
      this.session.onIncomingSDP.bind(this.session)
    )
    this.removeSessionListeners = [removeEndSessionListener, removeNegotiationListener]

    const msg = `Session ${this.session.id} successfully started`
    console.debug('[WebRTC] ' + msg)
    this.updateStreamStatus(msg)
  }

  /**
   *
   * @param {string} reason
   */
  private stopSession(reason: string): void {
    if (this.session === undefined) {
      console.debug('[WebRTC] Stopping an undefined session, probably it was already stopped?')
      return
    }
    const msg = `Stopping session ${this.session.id}. Reason: ${reason}`
    this.updateStreamStatus(msg)
    console.debug('[WebRTC] ' + msg)

    this.session.end()
    this.session = undefined
    this.removeSessionListeners.forEach((removeListener) => removeListener())
    this.removeSessionListeners = []
  }
}
