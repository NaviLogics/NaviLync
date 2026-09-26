import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { toRaw } from 'vue'

import type { PX4 } from '@/libs/vehicle/px4/px4'
import type { VehicleFactory } from '@/libs/vehicle/vehicle-factory'
import { i18n } from '@/plugins/i18n'
import type { useMainVehicleStore } from '@/stores/mainVehicle'
import type { Waypoint } from '@/types/mission'

// The WASM MAVLink parser and the Vuetify-mounted dialogs cannot load under vitest and are not needed here.
vi.mock('mavlink2rest-wasm', () => ({ default: vi.fn(), ParserEmitter: vi.fn() }))
vi.mock('mavlink2rest-wasm/mavlink2rest_wasm_bg.wasm?url', () => ({ default: '' }))
vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({ showDialog: vi.fn(), closeDialog: vi.fn() }),
}))
vi.mock('@/composables/usernamePrompDialog', () => ({ askForUsername: vi.fn() }))
// Joystick forwarding and BlueOS services are not part of mission transfers; stub them so they don't run against a PX4.
vi.mock('@/libs/joystick/protocols/mavlink-manual-control', async () => {
  const actual = await vi.importActual<typeof import('@/libs/joystick/protocols/mavlink-manual-control')>(
    '@/libs/joystick/protocols/mavlink-manual-control'
  )
  return {
    ...actual,
    MavlinkManualControlManager: class extends actual.MavlinkManualControlManager {
      /**
       *
       */
      setVehicle(): void {
        return
      }
    },
  }
})
vi.mock('@/libs/blueos', async () => ({
  ...(await vi.importActual<typeof import('@/libs/blueos')>('@/libs/blueos')),
  getKeyDataFromCockpitVehicleStorage: vi.fn(async () => {
    throw new Error('BlueOS is not available.')
  }),
  setKeyDataOnCockpitVehicleStorage: vi.fn(async () => undefined),
  getCpusInfo: vi.fn(() => new Promise(() => undefined)),
  getCpuTempCelsius: vi.fn(() => new Promise(() => undefined)),
  getNetworkInfo: vi.fn(() => new Promise(() => undefined)),
  getStatus: vi.fn(() => new Promise(() => undefined)),
  getVehicleName: vi.fn(() => new Promise(() => undefined)),
  getIpsInformationFromVehicle: vi.fn(() => new Promise(() => undefined)),
}))

let PX4Class: typeof PX4
let vehicleFactory: typeof VehicleFactory
let createMainVehicleStore: typeof useMainVehicleStore
let VehicleType: typeof import('@/libs/vehicle/vehicle').Type

const { t } = i18n.global

/**
 * A transfer that stays in progress until the test finishes it
 */
interface PendingTransfer<T> {
  /** The promise the vehicle returns for the transfer */
  promise: Promise<T>
  /** Finish the transfer successfully */
  finish: (value: T) => void
  /** Finish the transfer with an error */
  fail: (error: Error) => void
}

const pendingTransfer = <T>(): PendingTransfer<T> => {
  let finish: (value: T) => void = () => undefined
  let fail: (error: Error) => void = () => undefined
  const promise = new Promise<T>((resolve, reject) => {
    finish = resolve
    fail = reject
  })
  return { promise, finish, fail }
}

const busyMessage = (running: 'upload' | 'download' | 'clear'): string =>
  t('missionTransfer.busy', { running: t(`missionTransfer.${running}`) })

const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

const setupStoreWithPx4 = (): [PX4, ReturnType<typeof useMainVehicleStore>] => {
  const mainVehicleStore = createMainVehicleStore()
  const vehicle = new PX4Class(VehicleType.Rover, 1)
  vi.spyOn(vehicle, 'sendCommandLong').mockResolvedValue()
  vehicleFactory.onVehicles.emit_value([new WeakRef(vehicle)])
  expect(toRaw(mainVehicleStore.mainVehicle)).toBe(vehicle)
  return [vehicle, mainVehicleStore]
}

const noProgress = async (): Promise<void> => undefined

describe('one mission transfer at a time (P6)', () => {
  beforeAll(async () => {
    // jsdom has no Gamepad API, and the joystick manager polls it as soon as the stores are imported.
    Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true })
    PX4Class = (await import('@/libs/vehicle/px4/px4')).PX4
    vehicleFactory = (await import('@/libs/vehicle/vehicle-factory')).VehicleFactory
    createMainVehicleStore = (await import('@/stores/mainVehicle')).useMainVehicleStore
    VehicleType = (await import('@/libs/vehicle/vehicle')).Type
  })

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('while an upload runs, another upload, a download and a clear are refused and not sent', async () => {
    const [vehicle, mainVehicleStore] = setupStoreWithPx4()
    const upload = pendingTransfer<void>()
    const uploadSpy = vi.spyOn(vehicle, 'uploadMission').mockReturnValue(upload.promise)
    const fetchSpy = vi.spyOn(vehicle, 'fetchMission').mockResolvedValue([])
    const clearSpy = vi.spyOn(vehicle, 'clearMissions').mockResolvedValue()

    const first = mainVehicleStore.uploadMission([], noProgress)
    await flushPromises()

    await expect(mainVehicleStore.uploadMission([], noProgress)).rejects.toThrow(busyMessage('upload'))
    await expect(mainVehicleStore.fetchMission(noProgress)).rejects.toThrow(busyMessage('upload'))
    await expect(mainVehicleStore.clearMissions()).rejects.toThrow(busyMessage('upload'))
    expect(uploadSpy).toHaveBeenCalledOnce()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(clearSpy).not.toHaveBeenCalled()

    upload.finish()
    await expect(first).resolves.toBeUndefined()
  })

  test('while a download runs, an upload and a clear are refused and not sent', async () => {
    const [vehicle, mainVehicleStore] = setupStoreWithPx4()
    const download = pendingTransfer<Waypoint[]>()
    vi.spyOn(vehicle, 'fetchMission').mockReturnValue(download.promise)
    const uploadSpy = vi.spyOn(vehicle, 'uploadMission').mockResolvedValue()
    const clearSpy = vi.spyOn(vehicle, 'clearMissions').mockResolvedValue()

    const first = mainVehicleStore.fetchMission(noProgress)
    await flushPromises()

    await expect(mainVehicleStore.uploadMission([], noProgress)).rejects.toThrow(busyMessage('download'))
    await expect(mainVehicleStore.clearMissions()).rejects.toThrow(busyMessage('download'))
    expect(uploadSpy).not.toHaveBeenCalled()
    expect(clearSpy).not.toHaveBeenCalled()

    download.finish([])
    await expect(first).resolves.toEqual([])
  })

  test('while a clear runs, an upload and a download are refused and not sent', async () => {
    const [vehicle, mainVehicleStore] = setupStoreWithPx4()
    const clear = pendingTransfer<void>()
    vi.spyOn(vehicle, 'clearMissions').mockReturnValue(clear.promise)
    const uploadSpy = vi.spyOn(vehicle, 'uploadMission').mockResolvedValue()
    const fetchSpy = vi.spyOn(vehicle, 'fetchMission').mockResolvedValue([])

    const first = mainVehicleStore.clearMissions()
    await flushPromises()

    await expect(mainVehicleStore.uploadMission([], noProgress)).rejects.toThrow(busyMessage('clear'))
    await expect(mainVehicleStore.fetchMission(noProgress)).rejects.toThrow(busyMessage('clear'))
    expect(uploadSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()

    clear.finish()
    await expect(first).resolves.toBeUndefined()
  })

  test('the next transfer is allowed once the previous one finished, also when it failed', async () => {
    const [vehicle, mainVehicleStore] = setupStoreWithPx4()
    const upload = pendingTransfer<void>()
    vi.spyOn(vehicle, 'uploadMission').mockReturnValueOnce(upload.promise).mockResolvedValue()
    const fetchSpy = vi.spyOn(vehicle, 'fetchMission').mockResolvedValue([])

    const failed = mainVehicleStore.uploadMission([], noProgress)
    await flushPromises()
    upload.fail(new Error('Mission upload timed out.'))
    await expect(failed).rejects.toThrow('Mission upload timed out.')

    await expect(mainVehicleStore.fetchMission(noProgress)).resolves.toEqual([])
    await expect(mainVehicleStore.uploadMission([], noProgress)).resolves.toBeUndefined()
    expect(fetchSpy).toHaveBeenCalledOnce()
  })
})
