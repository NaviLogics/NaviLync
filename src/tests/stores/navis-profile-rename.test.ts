import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { type Ref, nextTick, ref, unref } from 'vue'

import { defaultBoatProfileHash, widgetProfiles } from '@/assets/defaults'
import usvImage from '@/assets/usv-navis-top.png'
import RovThumb from '@/assets/vehicles/BlueROV_thumb.png'
import { profileDisplayName, profileVehicleImage } from '@/libs/display-format'
import { i18n } from '@/plugins/i18n'
import type { Profile } from '@/types/widgets'

// The WASM MAVLink parser and the Vuetify-mounted dialogs cannot load under vitest and are not needed here
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))
vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({ showDialog: vi.fn(), closeDialog: vi.fn() }),
}))
vi.mock('@/composables/usernamePrompDialog', () => ({ askForUsername: vi.fn() }))

// What the previous version saved: the store reads its settings through useBlueOsStorage
const saved: Record<string, unknown> = {}
const storageRefs: Record<string, ReturnType<typeof ref>> = {}
vi.mock('@/composables/settingsSyncer', () => ({
  useBlueOsStorage: (key: string, defaultValue: unknown) => {
    storageRefs[key] = ref(key in saved ? structuredClone(saved[key]) : unref(defaultValue))
    return storageRefs[key]
  },
}))

import type { useWidgetManagerStore as UseWidgetManagerStore } from '@/stores/widgetManager'

let useWidgetManagerStore: typeof UseWidgetManagerStore

const viewsGroupKey = 'cockpit-views-group-v1'
const { t } = i18n.global
// With legacy: false the locale is a ref, although the createI18n generics type it as the locale string
const setLocale = (locale: 'ru' | 'en'): void => {
  ;(i18n.global.locale as unknown as Ref<string>).value = locale
}

// The profile set up on the bench: the built-in boat profile with the operator's own views and widgets
const benchProfile = (name: string, hash = defaultBoatProfileHash): Profile => {
  const profile = structuredClone(widgetProfiles.find((p) => p.hash === defaultBoatProfileHash)) as Profile
  profile.name = name
  profile.hash = hash
  profile.views[0].name = 'Карта оператора'
  profile.views[0].widgets = profile.views[0].widgets.slice(0, 1)
  profile.views.push({ ...structuredClone(profile.views[0]), name: 'Видео', hash: 'bench-view-2' })
  return profile
}

const withoutName = (profile: Profile): Omit<Profile, 'name'> => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { name, ...rest } = JSON.parse(JSON.stringify(profile))
  return rest
}

describe('the built-in boat profile becomes «Navis профиль» (bench, run 58)', () => {
  beforeAll(async () => {
    // The joystick manager, loaded with the store, polls the gamepads of the browser
    Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true })
    useWidgetManagerStore = (await import('@/stores/widgetManager')).useWidgetManagerStore
  })

  beforeEach(() => {
    Object.keys(saved).forEach((key) => delete saved[key])
    setActivePinia(createPinia())
    setLocale('ru')
  })

  test('a saved «Boat / USV» profile keeps its hash, views and widgets and is called «Navis профиль»', async () => {
    const before = benchProfile('Boat / USV')
    saved[viewsGroupKey] = before

    const store = useWidgetManagerStore()
    await nextTick()

    expect(store.currentProfile.name).toBe('Navis')
    expect(profileDisplayName(store.currentProfile.name, t)).toBe('Navis профиль')
    expect(withoutName(store.currentProfile)).toEqual(withoutName(before))
    expect(store.currentProfile.views.map((view) => view.name)).toEqual(['Карта оператора', 'Видео'])
  })

  test('the renamed profile is what gets saved', async () => {
    saved[viewsGroupKey] = benchProfile('Boat / USV')

    useWidgetManagerStore()
    await nextTick()

    expect((storageRefs[viewsGroupKey].value as Profile).name).toBe('Navis')
  })

  test('also a «Boat / USV» profile that arrives later, e.g. from another device, is renamed with its views kept', async () => {
    const store = useWidgetManagerStore()
    const later = benchProfile('Boat / USV', 'other-hash')

    storageRefs[viewsGroupKey].value = structuredClone(later)
    await nextTick()

    expect(store.currentProfile.name).toBe('Navis')
    expect(withoutName(store.currentProfile)).toEqual(withoutName(later))
  })

  test('a profile the operator named himself is left as it is', async () => {
    saved[viewsGroupKey] = benchProfile('Мой катер')

    const store = useWidgetManagerStore()
    await nextTick()

    expect(store.currentProfile.name).toBe('Мой катер')
  })

  test('in English the profile is «Navis profile»', () => {
    setLocale('en')
    expect(profileDisplayName('Navis', t)).toBe('Navis profile')
  })

  test('names that already end with the word are not doubled', () => {
    expect(profileDisplayName('ROV default', t)).toBe('ROV default профиль')
    expect(profileDisplayName('My profile', t)).toBe('My profile')
    expect(profileDisplayName('Мой профиль', t)).toBe('Мой профиль')
  })

  test('the built-in list offers «Navis» with the same hash, and no «Boat / USV» any more', () => {
    const boat = widgetProfiles.find((p) => p.hash === defaultBoatProfileHash)
    expect(boat?.name).toBe('Navis')
    expect(widgetProfiles.map((p) => p.name)).not.toContain('Boat / USV')
  })
})

describe('the vehicle picture next to the profile (bench, run 58)', () => {
  test('the Navis profile, and an old boat or USV one, show the NAVIS USV', () => {
    expect(profileVehicleImage('Navis')).toBe(usvImage)
    expect(profileVehicleImage('Boat / USV')).toBe(usvImage)
    expect(profileVehicleImage('Мой USV')).toBe(usvImage)
  })

  test('an ROV profile keeps the ROV picture', () => {
    expect(profileVehicleImage('ROV default')).toBe(RovThumb)
  })
})
