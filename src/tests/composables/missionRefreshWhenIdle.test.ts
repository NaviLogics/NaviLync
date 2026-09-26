import { beforeEach, describe, expect, test, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'

import type { MissionTransferKind } from '@/types/mission'

const vehicleStore = reactive({ missionTransferInProgress: undefined as MissionTransferKind | undefined })

vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => vehicleStore }))

import { useMissionRefreshWhenIdle } from '@/composables/missionRefreshWhenIdle'

// The flight map downloads the mission on its own: when it opens, when the vehicle comes back online and when a new
// mission was uploaded. On a weak link "online" flaps, and each flap used to start another download on top of the
// running one (PX4: "Req. WP was unexpected"). Such refreshes must wait for the running transfer, not be refused.
describe('automatic mission refresh while another mission transfer runs (P6)', () => {
  beforeEach(() => {
    vehicleStore.missionTransferInProgress = undefined
  })

  const setup = (): [ReturnType<typeof vi.fn>, () => Promise<void>] => {
    const refresh = vi.fn(async () => undefined)
    let requestRefresh: () => Promise<void> = async () => undefined
    effectScope().run(() => {
      requestRefresh = useMissionRefreshWhenIdle(refresh)
    })
    return [refresh, requestRefresh]
  }

  test('runs right away when no transfer is in progress', async () => {
    const [refresh, requestRefresh] = setup()

    await requestRefresh()

    expect(refresh).toHaveBeenCalledOnce()
  })

  test.each<MissionTransferKind>(['download', 'upload', 'clear'])(
    'while a %s runs, waits for it and then runs once, however many times it was requested',
    async (running) => {
      const [refresh, requestRefresh] = setup()
      vehicleStore.missionTransferInProgress = running

      await requestRefresh()
      await requestRefresh()
      await requestRefresh()
      await nextTick()
      expect(refresh).not.toHaveBeenCalled()

      vehicleStore.missionTransferInProgress = undefined
      await nextTick()
      expect(refresh).toHaveBeenCalledOnce()

      vehicleStore.missionTransferInProgress = 'download'
      vehicleStore.missionTransferInProgress = undefined
      await nextTick()
      expect(refresh).toHaveBeenCalledOnce()
    }
  )
})
