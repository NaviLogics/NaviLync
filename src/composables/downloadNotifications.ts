import { saveAs } from 'file-saver'

/**
 * Tell the operator where each file Electron finished downloading was saved
 * @returns {void}
 */
export const reportFinishedDownloads = (): void => undefined

/**
 * Save a file for the operator and tell them where it went
 * @param {Blob} blob - The file content
 * @param {string} fileName - The name to save it under
 */
export const saveFileAndReport = (blob: Blob, fileName: string): void => {
  saveAs(blob, fileName)
}
