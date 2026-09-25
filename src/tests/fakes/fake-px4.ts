import { vi } from 'vitest'

import { MavMissionResult, MavMissionType, MAVLinkType } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import type { Message } from '@/libs/connection/m2r/messages/mavlink2rest-message'

type FakePx4Options = {
  lossRate?: number
  duplicateRate?: number
  delayMs?: number
  seed?: number
}

const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
}

export const createFakePx4 = (options: FakePx4Options = {}) => {
  const random = seededRandom(options.seed ?? 1)
  const received: Message.MissionItemInt[] = []
  const emitted: unknown[] = []
  let expectedCount = 0
  let transactionStartedAt = 0

  const emit = (message: unknown): void => {
    if (random() < (options.lossRate ?? 0)) return
    const copies = random() < (options.duplicateRate ?? 0) ? 2 : 1
    for (let i = 0; i < copies; i += 1) {
      setTimeout(() => emitted.push(message), options.delayMs ?? 0)
    }
  }

  const receiveMissionCount = (count: number): void => {
    expectedCount = count
    received.length = 0
    transactionStartedAt = Date.now()
    emit({
      type: MAVLinkType.MISSION_REQUEST_INT,
      seq: 0,
      mission_type: { type: MavMissionType.MAV_MISSION_TYPE_MISSION },
    })
  }

  const receiveMissionItem = (item: Message.MissionItemInt): void => {
    if (Date.now() - transactionStartedAt >= 5000) return
    received[item.seq] = item
    if (received.filter(Boolean).length === expectedCount) {
      emit({
        type: MAVLinkType.MISSION_ACK,
        result: { type: MavMissionResult.MAV_MISSION_ACCEPTED },
        mission_type: { type: MavMissionType.MAV_MISSION_TYPE_MISSION },
      })
      return
    }
    setTimeout(() => {
      const next = received.findIndex((entry) => entry === undefined)
      emit({
        type: MAVLinkType.MISSION_REQUEST_INT,
        seq: next < 0 ? received.length : next,
        mission_type: { type: MavMissionType.MAV_MISSION_TYPE_MISSION },
      })
    }, 250)
  }

  const advance = async (milliseconds: number): Promise<void> => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  }

  return { emitted, received, receiveMissionCount, receiveMissionItem, advance }
}
