import { watch } from 'vue'

import { useMainVehicleStore } from '@/stores/mainVehicle'

/**
 * Wrap an automatic mission refresh (a download NaviLync starts on its own) so it does not collide with another
 * mission transfer: while one is in progress, the refresh waits for it to end instead of being refused, and all the
 * requests made meanwhile collapse into a single refresh. Must be called in a component setup or an effect scope.
 * @param {() => Promise<void>} refresh The refresh to run
 * @returns {() => Promise<void>} The function to call whenever a refresh is wanted
 * @example
 * // The flight map: on a weak link "vehicle online" flaps, and each flap asks for a refresh
 * const requestMissionRefresh = useMissionRefreshWhenIdle(refreshMission)
 * watch(() => vehicleStore.isVehicleOnline, () => requestMissionRefresh())
 */
export const useMissionRefreshWhenIdle = (refresh: () => Promise<void>): (() => Promise<void>) => {
  const vehicleStore = useMainVehicleStore()
  let isRefreshPending = false

  watch(
    () => vehicleStore.missionTransferInProgress,
    (transfer) => {
      if (transfer !== undefined || !isRefreshPending) return
      isRefreshPending = false
      refresh()
    }
  )

  return async (): Promise<void> => {
    if (vehicleStore.missionTransferInProgress !== undefined) {
      isRefreshPending = true
      return
    }
    await refresh()
  }
}
