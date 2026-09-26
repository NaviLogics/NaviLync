import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { FinishedDownload } from '@/types/electron-general'

const saveAs = vi.fn()
const openSnackbar = vi.fn()
vi.mock('file-saver', () => ({ saveAs: (...args: unknown[]) => saveAs(...args) }))
vi.mock('@/composables/snackbar', () => ({ openSnackbar: (...args: unknown[]) => openSnackbar(...args) }))

import { reportFinishedDownloads, saveFileAndReport } from '@/composables/downloadNotifications'

const lastSnackbar = (): {
  /** Snackbar severity */
  variant: string
  /** Snackbar text */
  message: string
} => openSnackbar.mock.calls[openSnackbar.mock.calls.length - 1]?.[0]

// Bench, run 56: after exporting the profile the operator did not know where the file went
describe('after an export the operator is told where the file is (bench)', () => {
  let finishDownload: ((download: FinishedDownload) => void) | undefined

  beforeEach(() => {
    saveAs.mockReset()
    openSnackbar.mockReset()
    finishDownload = undefined
  })

  afterEach(() => {
    delete (
      window as {
        /**
         *
         */
        electronAPI?: unknown
      }
    ).electronAPI
  })

  const inElectron = (): void => {
    ;(
      window as {
        /**
         *
         */
        electronAPI?: unknown
      }
    ).electronAPI = {
      onDownloadFinished: (callback: (download: FinishedDownload) => void) => (finishDownload = callback),
    }
  }

  test('in NaviLync for Windows, a saved file is reported with its full path', () => {
    inElectron()
    reportFinishedDownloads()

    finishDownload?.({
      state: 'completed',
      fileName: 'cockpit-views-group.json',
      path: 'C:\\Users\\operator\\Downloads\\cockpit-views-group.json',
    })

    expect(lastSnackbar()?.variant).toBe('success')
    expect(lastSnackbar()?.message).toContain('C:\\Users\\operator\\Downloads\\cockpit-views-group.json')
  })

  test('a save the operator cancelled is not reported as saved', () => {
    inElectron()
    reportFinishedDownloads()

    finishDownload?.({ state: 'cancelled', fileName: 'cockpit-views-group.json', path: '' })

    expect(openSnackbar).not.toHaveBeenCalled()
  })

  test('a save that failed is reported as an error with the file name', () => {
    inElectron()
    reportFinishedDownloads()

    finishDownload?.({ state: 'interrupted', fileName: 'cockpit-views-group.json', path: '' })

    expect(lastSnackbar()?.variant).toBe('error')
    expect(lastSnackbar()?.message).toContain('cockpit-views-group.json')
  })

  test('in the browser, where the path is not known, the file name and the downloads folder are reported', () => {
    saveFileAndReport(new Blob(['{}']), 'cockpit-views-group.json')

    expect(saveAs).toHaveBeenCalledOnce()
    expect(lastSnackbar()?.message).toContain('cockpit-views-group.json')
  })

  test('in NaviLync for Windows the path comes when the file is saved, so nothing is reported before that', () => {
    inElectron()

    saveFileAndReport(new Blob(['{}']), 'cockpit-views-group.json')

    expect(saveAs).toHaveBeenCalledOnce()
    expect(openSnackbar).not.toHaveBeenCalled()
  })

  test('profile and view exports go through it, and the profile menu calls export/import that exist', () => {
    const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')
    const widgetManager = read('src/stores/widgetManager.ts')
    const editMenu = read('src/components/EditMenu.vue')
    const main = read('src/electron/main.ts')

    expect(widgetManager).not.toMatch(/saveAs\(/)
    expect(widgetManager.match(/saveFileAndReport\(/g)?.length).toBe(2)
    expect(editMenu).not.toMatch(/store\.(exportProfile|importProfile)\(/)
    expect(editMenu).toMatch(/store\.exportViewsGroup\(store\.currentProfile\)/)
    expect(editMenu).toMatch(/store\.importViewsGroup\(e\)/)
    expect(main).toMatch(/setupDownloadsService\(mainWindow\)/)
  })
})
