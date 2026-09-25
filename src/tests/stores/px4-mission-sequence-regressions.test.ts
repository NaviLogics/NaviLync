// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { useMainVehicleStore } from '@/stores/mainVehicle'
import { useMissionStore } from '@/stores/mission'
import { AltitudeReferenceType, MissionCommandType, type Waypoint } from '@/types/mission'
import { MavCmd } from '@/libs/connection/m2r/messages/mavlink2rest-enum'

const waypoint = (id: string): Waypoint => ({
  id,
  coordinates: [55.75, 37.61],
  altitude: 0,
  altitudeReferenceType: AltitudeReferenceType.RELATIVE_TO_HOME,
  commands: [
    {
      type: MissionCommandType.MAVLINK_NAV_COMMAND,
      command: MavCmd.MAV_CMD_NAV_WAYPOINT,
      param1: 0,
      param2: 2,
      param3: 0,
      param4: 0,
    },
  ],
})

describe('T0 V1 PX4 plan-to-seq regressions', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  test('second waypoint can skip back to seq 0 in a three-waypoint PX4 mission', () => {
    const main = useMainVehicleStore()
    const mission = useMissionStore()
    main.lastHeartbeat = new Date()
    main.currentMissionSeq = 1
    mission.bumpVehicleMissionRevision([waypoint('a'), waypoint('b'), waypoint('c')])

    expect(mission.currentWaypointOnMission).toBe(1)
    expect(mission.canSkipToPrevWp).toBe(true)
  })

  test('stopMission resets a PX4 mission to seq 0', async () => {
    const main = useMainVehicleStore()
    const mission = useMissionStore()
    main.lastHeartbeat = new Date()
    const pause = vi.spyOn(main, 'pauseMission').mockResolvedValue()
    const setCurrent = vi.spyOn(main, 'setMissionCurrent').mockResolvedValue()

    const stopped = await mission.stopMission()

    expect(stopped).toBe(true)
    expect(pause).toHaveBeenCalledOnce()
    expect(setCurrent).toHaveBeenCalledWith(0)
  })

  test('a one-waypoint PX4 mission remains a valid executable plan at seq 0', () => {
    const main = useMainVehicleStore()
    const mission = useMissionStore()
    main.lastHeartbeat = new Date()
    main.currentMissionSeq = 0
    mission.bumpVehicleMissionRevision([waypoint('only')])

    expect(mission.currentWaypointOnMission).toBe(0)
    expect(mission.canSkipToNextWp).toBe(false)
  })
})
