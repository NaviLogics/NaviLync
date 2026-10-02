import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, test, vi } from 'vitest'

import type * as Defaults from '@/assets/defaults'
import type { migrateNavisSpeedIndicator as MigrateNavisSpeedIndicator } from '@/migration/profile-migrations'
import { type MiniWidget, type Profile, MiniWidgetType } from '@/types/widgets'

let defaultBoatProfileHash: string
let defaultRovProfileHash: string
let widgetProfiles: typeof Defaults.widgetProfiles
let migrateNavisSpeedIndicator: typeof MigrateNavisSpeedIndicator

// The WASM MAVLink parser cannot load under vitest
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))
vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({ showDialog: vi.fn(), closeDialog: vi.fn() }),
}))
vi.mock('@/composables/usernamePrompDialog', () => ({ askForUsername: vi.fn() }))

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')

const indicators = (profile: Profile): MiniWidget[] =>
  profile.views
    .flatMap((view) => view.miniWidgetContainers.flatMap((container) => container.widgets))
    .filter((widget) => widget.component === MiniWidgetType.VeryGenericIndicator)

// A Navis profile saved before release 1.0: the speed indicator on the EKF speed, 160 px wide
const savedNavisProfile = (): Profile => {
  const profile = JSON.parse(JSON.stringify(widgetProfiles.find((p) => p.hash === defaultBoatProfileHash))) as Profile
  const speed = indicators(profile).find((widget) => widget.options.displayName === 'Speed (GPS)')!
  Object.assign(speed.options, { variableName: 'VFR_HUD/groundspeed', decimalPlaces: 1, widgetWidth: 160 })
  delete speed.options.gnssSpeed
  return profile
}

// Review of #34: only the Navis speed indicator switches to GNSS, and saved Navis profiles get it too
describe('the Navis speed indicator shows the GNSS speed', () => {
  beforeAll(async () => {
    // jsdom has no Gamepad API, and the joystick manager polls it as soon as the profiles are imported
    Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true })
    ;({ defaultBoatProfileHash, defaultRovProfileHash, widgetProfiles } = await import('@/assets/defaults'))
    ;({ migrateNavisSpeedIndicator } = await import('@/migration/profile-migrations'))
  })

  test('the Navis default profile marks its speed indicator for the GNSS speed', () => {
    const navis = widgetProfiles.find((p) => p.hash === defaultBoatProfileHash)!
    const speed = indicators(navis).find((widget) => widget.options.displayName === 'Speed (GPS)')!
    expect(speed.options).toMatchObject({ gnssSpeed: true, variableName: 'GPS_RAW_INT/vel', widgetWidth: 208 })
  })

  test('a saved Navis profile is migrated: GNSS speed, GPS_RAW_INT/vel, 208 px', () => {
    const profile = savedNavisProfile()
    expect(migrateNavisSpeedIndicator(profile)).toBe(true)
    const speed = indicators(profile).find((widget) => widget.options.displayName === 'Speed (GPS)')!
    expect(speed.options).toMatchObject({ gnssSpeed: true, variableName: 'GPS_RAW_INT/vel', widgetWidth: 208 })
    // Once is enough
    expect(migrateNavisSpeedIndicator(profile)).toBe(false)
  })

  test('a wider indicator is not narrowed', () => {
    const profile = savedNavisProfile()
    indicators(profile).find((widget) => widget.options.displayName === 'Speed (GPS)')!.options.widgetWidth = 260
    migrateNavisSpeedIndicator(profile)
    expect(indicators(profile).find((w) => w.options.displayName === 'Speed (GPS)')!.options.widgetWidth).toBe(260)
  })

  test('other profiles and indicators the operator set up are left alone', () => {
    const rov = JSON.parse(JSON.stringify(widgetProfiles.find((p) => p.hash === defaultRovProfileHash))) as Profile
    const before = JSON.stringify(rov)
    migrateNavisSpeedIndicator(rov)
    expect(JSON.stringify(rov)).toBe(before)

    const navis = savedNavisProfile()
    const knots = indicators(navis).find((widget) => widget.options.displayName === 'Speed (GPS)')!
    Object.assign(knots.options, { displayName: 'Скорость, уз', variableMultiplier: 1.944, variableUnit: 'kn' })
    expect(migrateNavisSpeedIndicator(navis)).toBe(false)
    expect(knots.options.variableName).toBe('VFR_HUD/groundspeed')
  })

  test('the indicator switches to GNSS only when marked, so a knots indicator keeps its multiplier and unit', () => {
    const indicator = read('src/components/mini-widgets/VeryGenericIndicator.vue')
    expect(indicator).toMatch(/if \(!miniWidget\.value\.options\.gnssSpeed\) return undefined/)
  })

  test('the store migrates the profile when it is loaded', () => {
    expect(read('src/stores/widgetManager.ts')).toMatch(/migrateNavisSpeedIndicator\(viewsGroup\.value\)/)
  })
})
