import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const path = (file: string): string => join(process.cwd(), file)
const read = (file: string): string => readFileSync(path(file), 'utf8')

// Sizes of the images in an .ico file (0 in the directory means 256)
const icoSizes = (file: string): number[] => {
  const ico = readFileSync(path(file))
  expect(ico.readUInt16LE(0)).toBe(0)
  expect(ico.readUInt16LE(2)).toBe(1)
  const count = ico.readUInt16LE(4)
  return Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256).sort((a, b) => a - b)
}

// Width and height from the IHDR chunk of a PNG
const pngSize = (file: string): [number, number] => {
  const png = readFileSync(path(file))
  return [png.readUInt32BE(16), png.readUInt32BE(20)]
}

// Branding task, item 6
describe('application icon', () => {
  test('navilync.ico holds 16, 24, 32, 48, 64, 128 and 256 px', () => {
    expect(icoSizes('public/navilync.ico')).toEqual([16, 24, 32, 48, 64, 128, 256])
  })

  test('electron-builder uses it for the exe and the installer, and the window for its icon', () => {
    const build = JSON.parse(read('package.json')).build
    expect(build.win.icon).toBe('public/navilync.ico')
    expect(build.nsis.installerIcon).toBe('public/navilync.ico')
    expect(build.nsis.uninstallerIcon).toBe('public/navilync.ico')
    expect(read('src/electron/main.ts')).toMatch(/navilync\.ico/)
  })

  test('the favicon is the NaviLync one', () => {
    expect(icoSizes('public/favicon.ico')).toEqual([16, 32, 48])
  })
})

// Branding task, item 8
describe('splash screen', () => {
  test('the picture is cropped to the visible logo (no stray pixels, no offset to the right)', () => {
    expect(existsSync(path('src/assets/splash-navilync.png'))).toBe(true)
    const [width, height] = pngSize('src/assets/splash-navilync.png')
    expect(width).toBeLessThan(1200)
    expect(height).toBeLessThan(350)
    expect(width / height).toBeGreaterThan(3.5)
  })

  test('shown whole and centred on white, with the progress bar under it in the logo blue', () => {
    const splash = read('src/components/SplashScreen.vue')
    expect(splash).toMatch(/splash-navilync\.png/)
    expect(splash).toMatch(/object-contain|object-fit:\s*contain/)
    expect(splash).toMatch(/bg-white/)
    expect(splash).toMatch(/<v-progress-linear[^>]*color="#3D93C6"/)
  })
})

// Branding task, item 9
describe('widget menu', () => {
  test('Mission Control Panel and NAVIS ATLAS status have a preview picture', () => {
    const editMenu = read('src/components/EditMenu.vue')
    const images = editMenu.slice(editMenu.indexOf('const widgetImages = {'))
    expect(images).toMatch(/\n\s*MissionControlPanel: \w+,/)
    expect(images).toMatch(/\n\s*NavisAtlasStatus: \w+,/)
  })
})
