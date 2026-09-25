import { useInteractionDialog } from '@/composables/interactionDialog'
import { openSnackbar } from '@/composables/snackbar'
import { i18n } from '@/plugins/i18n'
import { useMainVehicleStore } from '@/stores/mainVehicle'

const formatCoordinates = (coordinates: [number, number]): string =>
  `${coordinates[0].toFixed(7)}, ${coordinates[1].toFixed(7)}`

/**
 * The explicit "Set HOME" action, the only way for the UI to change the vehicle HOME. The operator confirms in a
 * dialog showing the current and the new HOME, and success is reported only once the vehicle itself reports the new
 * HOME in HOME_POSITION.
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
            coordinates: currentHome ? formatCoordinates(currentHome) : t('setHome.unknownHome'),
          }),
          t('setHome.newHome', { coordinates: formatCoordinates(newHome) }),
          t('setHome.explanation'),
        ],
        maxWidth: 560,
        actions: [
          { text: t('setHome.cancel'), action: () => answer(false) },
          { text: t('setHome.confirm'), action: () => answer(true) },
        ],
      }).catch(() => resolve(false))
    })

  const requestSetHome = async (newHome: [number, number]): Promise<boolean> => {
    if (!(await confirmWithOperator(newHome))) return false

    try {
      await vehicleStore.setHomeWaypoint(newHome, 0)
    } catch (error) {
      openSnackbar({
        variant: 'error',
        message: t('setHome.failed', { error: error instanceof Error ? error.message : String(error) }),
        duration: 8000,
      })
      return false
    }

    openSnackbar({
      variant: 'success',
      message: t('setHome.success', { coordinates: formatCoordinates(vehicleStore.homePosition ?? newHome) }),
      duration: 5000,
    })
    return true
  }

  return { requestSetHome }
}
