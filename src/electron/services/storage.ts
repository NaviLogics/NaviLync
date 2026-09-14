import { dialog, ipcMain, shell } from 'electron'
import { app } from 'electron'
import * as fs from 'fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'path'

import type { FileDialogOptions, FileStats } from '@/types/storage'

// Keep the legacy Cockpit storage location during Phase 1 so existing user data
// remains available. A dedicated, tested migration to a NaviLync data directory
// will be introduced separately.
export const cockpitFolderPath = join(app.getPath('home'), 'Cockpit')
void fs.mkdir(cockpitFolderPath, { recursive: true })

/**
 * Resolve a renderer-provided relative path while guaranteeing that the result
 * remains inside the application storage root.
 * @param segments Relative path segments below the application storage root
 * @returns Safe absolute path
 */
export const resolveStoragePath = (...segments: string[]): string => {
  const root = resolve(cockpitFolderPath)
  const candidate = resolve(root, ...segments)
  const relativePath = relative(root, candidate)

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('Requested path escapes the application storage directory')
  }

  return candidate
}

const getStoragePath = (key?: string, subFolders?: string[]): string =>
  resolveStoragePath(...(subFolders ?? []), ...(key ? [key] : []))

export const filesystemStorage = {
  async setItem(key: string, value: ArrayBuffer, subFolders?: string[]): Promise<void> {
    const buffer = Buffer.from(value)
    const filePath = getStoragePath(key, subFolders)
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, buffer)
  },
  async getItem(key: string, subFolders?: string[]): Promise<ArrayBuffer | null> {
    const filePath = getStoragePath(key, subFolders)
    try {
      const buffer = await fs.readFile(filePath)
      return new Uint8Array(buffer).buffer
    } catch (error: any) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  },
  async removeItem(key: string, subFolders?: string[]): Promise<void> {
    const filePath = getStoragePath(key, subFolders)
    try {
      await fs.unlink(filePath)
    } catch (error: any) {
      // File doesn't exist, which is fine - just ignore it
      if (error.code === 'ENOENT') return

      throw error
    }
  },
  async clear(subFolders?: string[]): Promise<void> {
    const dirPath = getStoragePath(undefined, subFolders)
    await fs.rm(dirPath, { recursive: true })
  },
  async keys(subFolders?: string[]): Promise<string[]> {
    const dirPath = getStoragePath(undefined, subFolders)
    try {
      return await fs.readdir(dirPath)
    } catch (error: any) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  },
}

export const setupFilesystemStorage = (): void => {
  ipcMain.handle('setItem', async (_, data) => {
    await filesystemStorage.setItem(data.key, data.value, data.subFolders)
  })
  ipcMain.handle('getItem', async (_, data) => {
    return await filesystemStorage.getItem(data.key, data.subFolders)
  })
  ipcMain.handle('removeItem', async (_, data) => {
    await filesystemStorage.removeItem(data.key, data.subFolders)
  })
  ipcMain.handle('clear', async (_, data) => {
    await filesystemStorage.clear(data.subFolders)
  })
  ipcMain.handle('keys', async (_, data) => {
    return await filesystemStorage.keys(data.subFolders)
  })
  ipcMain.handle('open-cockpit-folder', async () => {
    await fs.mkdir(cockpitFolderPath, { recursive: true })
    await shell.openPath(cockpitFolderPath)
  })
  ipcMain.handle('open-video-folder', async () => {
    const videoFolderPath = resolveStoragePath('videos')
    await fs.mkdir(videoFolderPath, { recursive: true })
    await shell.openPath(videoFolderPath)
  })
  ipcMain.handle('open-video-file', async (_, fileName: string) => {
    const videoFilePath = resolveStoragePath('videos', fileName)
    await shell.openPath(videoFilePath)
  })
  ipcMain.handle('open-temp-video-chunks-folder', async () => {
    const tempChunksFolderPath = resolveStoragePath('videos', 'temporary-video-chunks')
    await fs.mkdir(tempChunksFolderPath, { recursive: true })
    await shell.openPath(tempChunksFolderPath)
  })

  /**
   * Get file stats for a file
   * @param pathOrKey - Either a full file path, or a key (filename) if subFolders is provided
   * @param subFolders - Optional subfolders under application storage (if provided, pathOrKey is treated as a key)
   */
  ipcMain.handle('get-file-stats', async (_, pathOrKey: string, subFolders?: string[]): Promise<FileStats> => {
    try {
      // Full paths are intentionally allowed when no subFolders are provided:
      // they originate from the native file picker and are used for imported media.
      const filePath = subFolders ? getStoragePath(pathOrKey, subFolders) : pathOrKey
      const stats = await fs.stat(filePath)
      return {
        exists: true,
        size: stats.size,
        mtime: stats.mtime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { exists: false }
      }
      console.error('Error getting file stats:', error)
      throw error
    }
  })

  /**
   * Show file dialog to select a file
   * @param options - Optional dialog configuration
   * @returns The selected file path, or null if cancelled
   */
  ipcMain.handle('get-path-of-selected-file', async (_, options?: FileDialogOptions) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: options?.filters,
      title: options?.title,
      defaultPath: options?.defaultPath,
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })
}
