import { BrowserWindow } from 'electron'

import type { FinishedDownload } from '@/types/electron-general'

/**
 * Tell the renderer where each file download (e.g. an exported profile) was saved, so it can show the operator the
 * path: the renderer only starts the download and never learns where the save dialog put the file
 * @param {BrowserWindow} window - The window whose downloads are reported to it
 */
export const setupDownloadsService = (window: BrowserWindow): void => {
  window.webContents.session.on('will-download', (_event, item) => {
    item.once('done', (_doneEvent, state) => {
      if (window.isDestroyed()) return
      const download: FinishedDownload = { path: item.getSavePath(), fileName: item.getFilename(), state }
      window.webContents.send('download-finished', download)
    })
  })
}
