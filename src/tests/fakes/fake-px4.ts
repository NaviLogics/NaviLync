import type { Package } from '@/libs/connection/m2r/messages/mavlink2rest'
import {
  MavAutopilot,
  MavFrame,
  MAVLinkType,
  MavMissionResult,
  MavMissionType,
  MavModeFlag,
  MavResult,
  MavSeverity,
  MavState,
  MavType,
} from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import type { Message } from '@/libs/connection/m2r/messages/mavlink2rest-message'
import { advanceTimers } from '@/tests/helpers/advance-timers'

export interface FakePx4Options {
  lossRate?: number
  duplicateRate?: number
  delayMs?: number
  seed?: number
  systemId?: number
  componentId?: number
}

export interface FakePx4 {
  /** NaviLync -> PX4 packet in mavlink2rest format. */
  receive(pack: Package): void
  /** PX4 -> NaviLync subscription. */
  onSend(listener: (pack: Package) => void): () => void
  /** Advance fake timers used by the deterministic link and PX4 protocol timers. */
  advance(ms: number): Promise<void>
  /** Emit a PX4 heartbeat with a chosen MAV_TYPE/custom_mode. */
  heartbeat(mavtype?: MavType, customMode?: number): void
  /** Emit HOME_POSITION. */
  homePosition(latitude: number, longitude: number, altitudeMm?: number): void
  readonly storedMission: readonly Message.MissionItemInt[]
}

type Direction = 'toPx4' | 'fromPx4'

const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
}

export const createFakePx4 = (options: FakePx4Options = {}): FakePx4 => {
  const systemId = options.systemId ?? 1
  const componentId = options.componentId ?? 1
  const lossRandom = {
    toPx4: seededRandom((options.seed ?? 1) ^ 0x13579bdf),
    fromPx4: seededRandom((options.seed ?? 1) ^ 0x2468ace0),
  }
  const duplicateRandom = {
    toPx4: seededRandom((options.seed ?? 1) ^ 0x55aa55aa),
    fromPx4: seededRandom((options.seed ?? 1) ^ 0xaa55aa55),
  }
  const listeners = new Set<(pack: Package) => void>()
  const mission: Message.MissionItemInt[] = []
  let state: 'idle' | 'receiving' = 'idle'
  let expectedCount = 0
  let expectedSeq = 0
  let partnerSystem = 0
  let partnerComponent = 0
  let sequence = 0
  let retryGeneration = 0
  let timeoutGeneration = 0

  const packet = (message: Package['message']): Package =>
    ({
      header: { system_id: systemId, component_id: componentId, sequence: sequence++ & 0xff },
      message,
    } as Package)

  const deliver = (direction: Direction, action: () => void): void => {
    if (lossRandom[direction]() < (options.lossRate ?? 0)) return
    const copies = duplicateRandom[direction]() < (options.duplicateRate ?? 0) ? 2 : 1
    for (let i = 0; i < copies; i += 1) setTimeout(action, options.delayMs ?? 0)
  }

  const send = (message: Package['message']): void => {
    const outgoing = packet(message)
    deliver('fromPx4', () => listeners.forEach((listener) => listener(outgoing)))
  }

  const sendAck = (result: MavMissionResult): void => {
    send({
      type: MAVLinkType.MISSION_ACK,
      target_system: partnerSystem,
      target_component: partnerComponent,
      mavtype: { type: result },
      mission_type: { type: MavMissionType.MAV_MISSION_TYPE_MISSION },
      opaque_id: 0,
    } as unknown as Package['message'])
  }

  const armTransferTimeout = (): void => {
    const generation = ++timeoutGeneration
    setTimeout(() => {
      if (generation !== timeoutGeneration || state === 'idle') return
      state = 'idle'
      retryGeneration += 1
      send({
        type: MAVLinkType.STATUSTEXT,
        severity: { type: MavSeverity.MAV_SEVERITY_CRITICAL },
        text: [...'Mission sync timeout\0'],
        id: 0,
        chunk_seq: 0,
      } as unknown as Package['message'])
    }, 5000)
  }

  const requestExpected = (): void => {
    if (state !== 'receiving') return
    send({
      type: MAVLinkType.MISSION_REQUEST_INT,
      target_system: partnerSystem,
      target_component: partnerComponent,
      seq: expectedSeq,
      mission_type: { type: MavMissionType.MAV_MISSION_TYPE_MISSION },
    } as unknown as Package['message'])
    const generation = ++retryGeneration
    setTimeout(() => {
      if (state === 'receiving' && generation === retryGeneration) requestExpected()
    }, 250)
  }

  const process = (pack: Package): void => {
    const message = pack.message
    if ('target_system' in message && message.target_system !== systemId) return
    if ('target_component' in message && ![0, componentId].includes(message.target_component)) return

    switch (message.type) {
      case MAVLinkType.MISSION_COUNT: {
        if (state === 'receiving' && (pack.header.system_id !== partnerSystem || pack.header.component_id !== partnerComponent)) {
          return
        }
        partnerSystem = pack.header.system_id
        partnerComponent = pack.header.component_id
        const count = message as Message.MissionCount
        mission.length = 0
        expectedCount = count.count
        expectedSeq = 0
        state = 'receiving'
        armTransferTimeout()
        if (expectedCount === 0) {
          state = 'idle'
          sendAck(MavMissionResult.MAV_MISSION_ACCEPTED)
        } else {
          requestExpected()
        }
        break
      }
      case MAVLinkType.MISSION_ITEM_INT: {
        if (state !== 'receiving') return
        if (pack.header.system_id !== partnerSystem || pack.header.component_id !== partnerComponent) return
        const item = message as Message.MissionItemInt
        armTransferTimeout()
        retryGeneration += 1
        if (item.seq !== expectedSeq) {
          requestExpected()
          return
        }
        if (
          item.command.type.startsWith('MAV_CMD_DO_') &&
          (item.frame.type !== MavFrame.MAV_FRAME_MISSION || item.x !== 0 || item.y !== 0 || item.z !== 0)
        ) {
          state = 'idle'
          sendAck(MavMissionResult.MAV_MISSION_UNSUPPORTED)
          return
        }
        mission[item.seq] = item
        expectedSeq += 1
        if (expectedSeq >= expectedCount) {
          state = 'idle'
          sendAck(MavMissionResult.MAV_MISSION_ACCEPTED)
        } else {
          requestExpected()
        }
        break
      }
      case MAVLinkType.MISSION_CLEAR_ALL:
        partnerSystem = pack.header.system_id
        partnerComponent = pack.header.component_id
        mission.length = 0
        sendAck(MavMissionResult.MAV_MISSION_ACCEPTED)
        break
      case MAVLinkType.MISSION_REQUEST_LIST:
        partnerSystem = pack.header.system_id
        partnerComponent = pack.header.component_id
        send({
          type: MAVLinkType.MISSION_COUNT,
          target_system: partnerSystem,
          target_component: partnerComponent,
          count: mission.length,
          mission_type: { type: MavMissionType.MAV_MISSION_TYPE_MISSION },
          opaque_id: 0,
        } as unknown as Package['message'])
        break
      case MAVLinkType.MISSION_REQUEST_INT: {
        partnerSystem = pack.header.system_id
        partnerComponent = pack.header.component_id
        const request = message as Message.MissionRequestInt
        const item = mission[request.seq]
        if (item !== undefined) {
          send({
            ...item,
            target_system: partnerSystem,
            target_component: partnerComponent,
          } as unknown as Package['message'])
        }
        break
      }
      case MAVLinkType.COMMAND_LONG: {
        partnerSystem = pack.header.system_id
        partnerComponent = pack.header.component_id
        const command = message as Message.CommandLong
        send({
          type: MAVLinkType.COMMAND_ACK,
          command: command.command,
          result: { type: MavResult.MAV_RESULT_ACCEPTED },
          progress: 100,
          result_param2: 0,
          target_system: partnerSystem,
          target_component: partnerComponent,
        } as unknown as Package['message'])
        break
      }
      default:
        break
    }
  }

  const receive = (pack: Package): void => deliver('toPx4', () => process(pack))

  const onSend = (listener: (pack: Package) => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const advance = async (ms: number): Promise<void> => {
    await advanceTimers(ms)
  }

  const heartbeat = (mavtype = MavType.MAV_TYPE_GROUND_ROVER, customMode = 0): void => {
    send({
      type: MAVLinkType.HEARTBEAT,
      custom_mode: customMode,
      mavtype: { type: mavtype },
      autopilot: { type: MavAutopilot.MAV_AUTOPILOT_PX4 },
      base_mode: { bits: MavModeFlag.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED },
      system_status: { type: MavState.MAV_STATE_ACTIVE },
      mavlink_version: 3,
    } as unknown as Package['message'])
  }

  const homePosition = (latitude: number, longitude: number, altitudeMm = 0): void => {
    send({
      type: MAVLinkType.HOME_POSITION,
      latitude: Math.round(latitude * 1e7),
      longitude: Math.round(longitude * 1e7),
      altitude: altitudeMm,
      x: 0,
      y: 0,
      z: 0,
      q: [1, 0, 0, 0],
      approach_x: 0,
      approach_y: 0,
      approach_z: 0,
      time_usec: 0,
    } as unknown as Package['message'])
  }

  return { receive, onSend, advance, heartbeat, homePosition, storedMission: mission }
}
