import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')
const packageJson = JSON.parse(read('package.json'))

// Bench, run 58: the Windows taskbar still showed the Cockpit icon
describe('Windows application identity (bench, run 58)', () => {
  test('the window icon is a PNG: Windows loads a window .ico from outside the asar archive only', () => {
    const main = read('src/electron/main.ts')
    expect(main).toMatch(/icon: join\(ROOT_PATH\.dist, 'pwa-512x512\.png'\)/)
    expect(main).not.toMatch(/navilync\.ico/)
  })

  test('the exe gets navilync.ico, and the Windows build checks that it is really in NaviLync.exe', () => {
    expect(packageJson.build.win.icon).toBe('public/navilync.ico')
    const workflow = read('.github/workflows/navilync-windows.yml')
    expect(workflow).toMatch(
      /node scripts\/check-windows-exe-icon\.mjs dist\/win-unpacked\/NaviLync\.exe public\/navilync\.ico/
    )
    // Before packaging, so that a wrong icon fails the build instead of reaching the bench
    expect(workflow.indexOf('check-windows-exe-icon')).toBeLessThan(workflow.indexOf('Compress-Archive'))
  })

  test('the taskbar id is NaviLync, the same as the build appId, and has nothing of Cockpit', () => {
    const main = read('src/electron/main.ts')
    expect(main).toMatch(new RegExp(`app\\.setAppUserModelId\\('${packageJson.build.appId}'\\)`))
    expect(packageJson.build.appId).toBe('ru.navilogics.navilync')
    expect(packageJson.build.productName).toBe('NaviLync')
  })

  // Electron names the user data folder (%APPDATA%\navilync: Local Storage with profiles and settings) after the
  // top-level productName, or else the name, of package.json. Changing either would start from an empty folder.
  test('the user data folder stays %APPDATA%\\navilync, and the data folder ~/Cockpit', () => {
    expect(packageJson.name).toBe('navilync')
    expect(packageJson.productName).toBeUndefined()
    expect(read('src/electron/main.ts')).not.toMatch(/setPath\('userData'|app\.setName\(/)
    expect(read('src/electron/services/storage.ts')).toMatch(/join\(app\.getPath\('home'\), 'Cockpit'\)/)
  })

  test('the user data folder is written to the log, to compare it on the bench', () => {
    expect(read('src/electron/main.ts')).toMatch(/app\.getPath\('userData'\)/)
  })
})

// Bench, run 58: the picture next to the profile in the main menu was the BlueBoat
describe('the vehicle picture in the main menu (bench, run 58)', () => {
  const editMenu = read('src/components/EditMenu.vue')

  test('comes from profileVehicleImage and is fitted whole, keeping its proportions', () => {
    expect(editMenu).toMatch(/:src="profileVehicleImage\(store\.currentProfile\.name\)"/)
    expect(editMenu).toMatch(/:src="profileVehicleImage\(profile\.name\)"/)
    expect(editMenu.match(/alt="current-vehicle"\s+class="[^"]*object-contain/g)?.length).toBe(2)
    expect(editMenu).not.toMatch(/BlueBoat_thumb/)
  })

  test('the profile name is shown through profileDisplayName everywhere', () => {
    expect(editMenu).not.toMatch(/endsWith\('profile'\)/)
    expect(editMenu.match(/profileDisplayName\(/g)?.length).toBeGreaterThanOrEqual(4)
  })
})
