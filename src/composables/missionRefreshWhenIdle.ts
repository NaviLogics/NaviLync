import { useMainVehicleStore } from '@/stores/mainVehicle'

/**
 * Wrap an automatic mission refresh (a download NaviLync starts on its own) so it does not collide with another
 * mission transfer
 * @param {() => Promise<void>} refresh The refresh to run
 * @returns {() => Promise<void>} The function to call whenever a refresh is wanted
 */
export const useMissionRefreshWhenIdle = (refresh: () => Promise<void>): (() => Promise<void>) => {
  useMainVehicleStore()
  return refresh
}
