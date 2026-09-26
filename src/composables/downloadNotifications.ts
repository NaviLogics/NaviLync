import { saveAs } from 'file-saver'

import { openSnackbar } from '@/composables/snackbar'
import { i18n } from '@/plugins/i18n'

/**
 * Tell the operator where each file Electron finished downloading was saved (NaviLync for Windows only; the browser
 * shows its own download bar). Call once, at startup.
 * @returns {void}
 */
export const reportFinishedDownloads = (): void => {
  const { t } = i18n.global
  window.electronAPI?.onDownloadFinished((download) => {
    if (download.state === 'completed') {
      openSnackbar({ variant: 'success', message: t('downloads.savedTo', { path: download.path }), duration: 10000 })
    } else if (download.state === 'interrupted') {
      openSnackbar({
        variant: 'error',
        message: t('downloads.failed', { fileName: download.fileName }),
        duration: 10000,
      })
    }
  })
}

/**
 * Save a file for the operator and tell them where it went. In NaviLync for Windows the full path is reported once
 * the file is saved (see reportFinishedDownloads); a browser does not reveal the path, so only the file name is given.
 * @param {Blob} blob - The file content
 * @param {string} fileName - The name to save it under
 */
export const saveFileAndReport = (blob: Blob, fileName: string): void => {
  saveAs(blob, fileName)
  if (window.electronAPI) return
  openSnackbar({
    variant: 'info',
    message: i18n.global.t('downloads.savedToBrowserDownloads', { fileName }),
    duration: 10000,
  })
}
