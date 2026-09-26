import { useInteractionDialog } from '@/composables/interactionDialog'
import { openSnackbar } from '@/composables/snackbar'
import { MavResult } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import { CommandRejectedError } from '@/libs/vehicle/mavlink/command-rejected-error'
import { i18n } from '@/plugins/i18n'
import { useMainVehicleStore } from '@/stores/mainVehicle'

const formatCoordinates = (coordinates: [number, number]): string =>
  `${coordinates[0].toFixed(7)}, ${coordinates[1].toFixed(7)}`

// PX4 answers MAV_CMD_DO_SET_HOME with these results while it has no global position to validate the new HOME against
const resultsMeaningNoGpsFix = [MavResult.MAV_RESULT_TEMPORARILY_REJECTED, MavResult.MAV_RESULT_DENIED]

/**
 * The explicit "Set HOME" action, the only way for the UI to change the vehicle HOME. The operator confirms in a
 * dialog showing the current and the new HOME, and success is reported only once the vehicle itself reports the new
 * HOME in HOME_POSITION. Every outcome, including a cancel, ends in a message to the operator.
 *
 * PX4 keeps a HOME set this way as a manual HOME, which it does not overwrite when the vehicle arms.
 * @returns {{ requestSetHome: (newHome: [number, number]) => Promise<boolean> }} `requestSetHome` resolves to `true`
 * when the vehicle confirmed the new HOME, and to `false` when the operator cancelled or the change was not confirmed
 */
export const useSetHomeAction = (): {
  /**
   * Ask the operator to confirm and, if confirmed, change the vehicle HOME
   * @param {[number, number]} newHome - Latitude and longitude of the new HOME, in degrees
   * @returns {Promise<boolean>} Whether the vehicle confirmed the new HOME
   */
  requestSetHome: (newHome: [number, number]) => Promise<boolean>
} => {
  const vehicleStore = useMainVehicleStore()
  const { showDialog, closeDialog } = useInteractionDialog()
  const { t } = i18n.global

  // The dialog reports "confirmed" for every button, so the answer comes from which button was pressed.
  const confirmWithOperator = (newHome: [number, number]): Promise<boolean> =>
    new Promise((resolve) => {
      const currentHome = vehicleStore.homePosition
      const answer = (confirmed: boolean): void => {
        closeDialog()
        resolve(confirmed)
      }
      showDialog({
        variant: 'warning',
        title: t('setHome.title'),
        message: [
          t('setHome.currentHome', {
            coordinates: currentHome
              ? formatCoordinates([currentHome.latitude, currentHome.longitude])
              : t('setHome.unknownHome'),
          }),
          t('setHome.newHome', { coordinates: formatCoordinates(newHome) }),
          t('setHome.persistsAcrossArming'),
          t('setHome.explanation'),
        ],
        maxWidth: 560,
        actions: [
          { text: t('setHome.cancel'), action: () => answer(false) },
          { text: t('setHome.confirm'), action: () => answer(true) },
        ],
      }).catch(() => resolve(false))
    })

  // MAV_CMD_DO_SET_HOME takes an altitude above mean sea level. Keep the current HOME's, else use where the vehicle is;
  // sending 0 would put HOME at sea level.
  const altitudeForNewHome = (): number | undefined =>
    vehicleStore.homePosition?.altitude ?? vehicleStore.altitude.msl?.toNumber('m')

  const failureMessage = (error: unknown): string => {
    if (error instanceof CommandRejectedError) {
      return resultsMeaningNoGpsFix.includes(error.result)
        ? t('setHome.needsGpsFix')
        : t('setHome.rejected', { result: error.result })
    }
    return t('setHome.failed', { error: error instanceof Error ? error.message : String(error) })
  }

  const requestSetHome = async (newHome: [number, number]): Promise<boolean> => {
    if (!(await confirmWithOperator(newHome))) {
      openSnackbar({ variant: 'info', message: t('setHome.cancelled'), duration: 4000 })
      return false
    }

    const altitude = altitudeForNewHome()
    if (altitude === undefined) {
      openSnackbar({ variant: 'error', message: t('setHome.needsGpsFix'), duration: 8000 })
      return false
    }

    try {
      await vehicleStore.setHomeWaypoint(newHome, altitude)
    } catch (error) {
      openSnackbar({ variant: 'error', message: failureMessage(error), duration: 8000 })
      return false
    }

    const reportedHome = vehicleStore.homePosition
    openSnackbar({
      variant: 'success',
      message: t('setHome.success', {
        coordinates: formatCoordinates(reportedHome ? [reportedHome.latitude, reportedHome.longitude] : newHome),
      }),
      duration: 5000,
    })
    return true
  }

  return { requestSetHome }
}
