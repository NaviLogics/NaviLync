import { useInteractionDialog } from '@/composables/interactionDialog'
import i18n from '@/plugins/i18n'

import { reloadCockpit } from './utils'

const { showDialog } = useInteractionDialog()

/**
 * Wait till the next tick to reload Cockpit
 * @param {number} timeout The time to wait before reloading, with a warning dialog opened, in milliseconds. Default value is 500 ms.
 */
export const reloadCockpitAndWarnUser = (timeout = 4000): void => {
  const restartMessage = i18n.global.t('libs.utilsVue.restartingCockpit', { seconds: timeout / 1000 })
  console.log(restartMessage)
  showDialog({ message: restartMessage, variant: 'info', timer: timeout })
  reloadCockpit(timeout)
}
