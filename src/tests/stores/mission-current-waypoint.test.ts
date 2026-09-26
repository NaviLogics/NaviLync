import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { reactive } from 'vue'

import { MavAutopilot } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import { makeDefaultNavCommands, withCruiseSpeed } from '@/libs/mission/mission-items'
import type { useMissionStore } from '@/stores/mission'
import { type Waypoint, AltitudeReferenceType } from '@/types/mission'

const vehicleStore = reactive({
  firmwareType: MavAutopilot.MAV_AUTOPILOT_PX4 as MavAutopilot | undefined,
  currentMissionSeq: undefined as number | undefined,
  isVehicleOnline: true,
  mode: 'Mission',
})

vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => vehicleStore }))
vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({ showDialog: vi.fn(), closeDialog: vi.fn() }),
}))
vi.mock('@/composables/usernamePrompDialog', () => ({ askForUsername: vi.fn() }))

let createMissionStore: typeof useMissionStore

const waypoint = (latitude: number, longitude: number): Waypoint => ({
  id: `${latitude},${longitude}`,
  coordinates: [latitude, longitude],
  altitude: 0,
  altitudeReferenceType: AltitudeReferenceType.RELATIVE_TO_HOME,
  commands: makeDefaultNavCommands(),
})

const plan = [waypoint(55.75, 37.61), waypoint(55.751, 37.611), waypoint(55.752, 37.612)]

// The number the mission control panels show as the current waypoint, for the PX4 mission as uploaded by P5:
// seq 0 DO_CHANGE_SPEED 1.5 m/s, seq 1..3 the waypoints, markers 1..3
describe('current waypoint shown for a PX4 mission with the speed item at seq 0 (P5)', () => {
  beforeAll(async () => {
    createMissionStore = (await import('@/stores/mission')).useMissionStore
  })

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vehicleStore.firmwareType = MavAutopilot.MAV_AUTOPILOT_PX4
    vehicleStore.currentMissionSeq = undefined
  })

  test.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [3, 3],
  ])('MISSION_CURRENT seq %i → current waypoint %i', (seq, shown) => {
    const missionStore = createMissionStore()
    missionStore.bumpVehicleMissionRevision(withCruiseSpeed(plan, 1.5))

    vehicleStore.currentMissionSeq = seq

    expect(missionStore.currentWaypointOnMission).toBe(shown)
  })

  test('before any MISSION_CURRENT no waypoint is shown as current', () => {
    const missionStore = createMissionStore()
    missionStore.bumpVehicleMissionRevision(withCruiseSpeed(plan, 1.5))

    expect(missionStore.currentWaypointOnMission).toBe(0)
  })

  test('ArduPilot, HOME at item 0: unchanged', () => {
    vehicleStore.firmwareType = MavAutopilot.MAV_AUTOPILOT_ARDUPILOTMEGA
    const missionStore = createMissionStore()
    missionStore.bumpVehicleMissionRevision([waypoint(55.7, 37.6), ...plan])

    vehicleStore.currentMissionSeq = 0
    expect(missionStore.currentWaypointOnMission).toBe(0)
    vehicleStore.currentMissionSeq = 2
    expect(missionStore.currentWaypointOnMission).toBe(2)
    vehicleStore.currentMissionSeq = 3
    expect(missionStore.currentWaypointOnMission).toBe(3)
  })
})
