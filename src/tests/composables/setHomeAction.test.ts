import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { DialogOptions } from '@/composables/interactionDialog'
import { MavCmd, MavResult } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import { CommandRejectedError } from '@/libs/vehicle/mavlink/command-rejected-error'
import { i18n } from '@/plugins/i18n'

const dialogs: DialogOptions[] = []
const vehicleStore = {
  homePosition: { latitude: 55.75, longitude: 37.61, altitude: 12.5 } as
    | {
        /** Latitude in degrees */
        latitude: number
        /** Longitude in degrees */
        longitude: number
        /** Altitude above mean sea level, in meters */
        altitude: number
      }
    | undefined,
  altitude: {
    msl: undefined as
      | {
          /**
           *
           */
          toNumber: (unit: string) => number
        }
      | undefined,
  },
  setHomeWaypoint: vi.fn(async (coordinates: [number, number], altitude: number) => {
    void coordinates
    void altitude
  }),
}
const openSnackbar = vi.fn()

vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({
    showDialog: (options: DialogOptions) => {
      dialogs.push(options)
      return new Promise(() => undefined)
    },
    closeDialog: vi.fn(),
  }),
}))
vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => vehicleStore }))
vi.mock('@/composables/snackbar', () => ({ openSnackbar: (...args: unknown[]) => openSnackbar(...args) }))

import { useSetHomeAction } from '@/composables/setHomeAction'

const { t } = i18n.global

const lastDialog = (): DialogOptions => {
  const dialog = dialogs[dialogs.length - 1]
  expect(dialog).toBeDefined()
  return dialog
}

const pressDialogButton = (index: number): void => {
  const action = lastDialog().actions?.[index]
  expect(action).toBeDefined()
  action?.action()
}

const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

const confirmSetHome = async (newHome: [number, number]): Promise<boolean> => {
  const { requestSetHome } = useSetHomeAction()
  const result = requestSetHome(newHome)
  await flushPromises()
  pressDialogButton(1)
  return result
}

const lastSnackbar = (): {
  /** Snackbar severity */
  variant: string
  /** Snackbar text */
  message: string
} => openSnackbar.mock.calls[openSnackbar.mock.calls.length - 1]?.[0]

describe('explicit "Set HOME" action (K1, P7)', () => {
  beforeEach(() => {
    dialogs.length = 0
    vehicleStore.homePosition = { latitude: 55.75, longitude: 37.61, altitude: 12.5 }
    vehicleStore.altitude.msl = undefined
    vehicleStore.setHomeWaypoint.mockReset()
    vehicleStore.setHomeWaypoint.mockResolvedValue(undefined)
    openSnackbar.mockReset()
  })

  test('asks for confirmation with the current and the new HOME, and says it survives arming', async () => {
    const { requestSetHome } = useSetHomeAction()

    void requestSetHome([55.7612345, 37.6212345])
    await flushPromises()

    const message = [lastDialog().message].flat().join('\n')
    expect(message).toContain('55.7500000, 37.6100000')
    expect(message).toContain('55.7612345, 37.6212345')
    expect(message).toContain(t('setHome.persistsAcrossArming'))
    expect(lastDialog().actions).toHaveLength(2)
    expect(vehicleStore.setHomeWaypoint).not.toHaveBeenCalled()
  })

  test('cancel sends nothing and says HOME was not changed', async () => {
    const { requestSetHome } = useSetHomeAction()

    const result = requestSetHome([55.76, 37.62])
    await flushPromises()
    pressDialogButton(0)

    await expect(result).resolves.toBe(false)
    expect(vehicleStore.setHomeWaypoint).not.toHaveBeenCalled()
    expect(lastSnackbar()).toMatchObject({ variant: 'info', message: t('setHome.cancelled') })
  })

  test('sends the altitude of the current HOME, not 0 m above sea level', async () => {
    await expect(confirmSetHome([55.76, 37.62])).resolves.toBe(true)

    expect(vehicleStore.setHomeWaypoint).toHaveBeenCalledOnce()
    expect(vehicleStore.setHomeWaypoint).toHaveBeenCalledWith([55.76, 37.62], 12.5)
    expect(lastSnackbar()).toMatchObject({ variant: 'success' })
  })

  test('without a HOME yet, sends the current altitude of the vehicle', async () => {
    vehicleStore.homePosition = undefined
    vehicleStore.altitude.msl = { toNumber: (unit: string) => (unit === 'm' ? 7.25 : NaN) }

    await expect(confirmSetHome([55.76, 37.62])).resolves.toBe(true)

    expect(vehicleStore.setHomeWaypoint).toHaveBeenCalledWith([55.76, 37.62], 7.25)
  })

  test('without a HOME and without a vehicle altitude, sends nothing and says a GPS fix is needed', async () => {
    vehicleStore.homePosition = undefined

    await expect(confirmSetHome([55.76, 37.62])).resolves.toBe(false)

    expect(vehicleStore.setHomeWaypoint).not.toHaveBeenCalled()
    expect(lastSnackbar()).toMatchObject({ variant: 'error', message: t('setHome.needsGpsFix') })
  })

  test('when PX4 answers TEMPORARILY_REJECTED, says a GPS fix is needed', async () => {
    vehicleStore.setHomeWaypoint.mockRejectedValue(
      new CommandRejectedError(MavCmd.MAV_CMD_DO_SET_HOME, MavResult.MAV_RESULT_TEMPORARILY_REJECTED)
    )

    await expect(confirmSetHome([55.76, 37.62])).resolves.toBe(false)

    expect(lastSnackbar()).toMatchObject({ variant: 'error', message: t('setHome.needsGpsFix') })
  })

  // PX4 1.17 Commander answers DENIED to DO_SET_HOME when lat/lon/alt are not finite, which says nothing about GPS
  test('when PX4 answers DENIED, says the vehicle refused the HOME coordinates or altitude, with the result', async () => {
    vehicleStore.setHomeWaypoint.mockRejectedValue(
      new CommandRejectedError(MavCmd.MAV_CMD_DO_SET_HOME, MavResult.MAV_RESULT_DENIED)
    )

    await expect(confirmSetHome([55.76, 37.62])).resolves.toBe(false)

    expect(lastSnackbar().variant).toBe('error')
    expect(lastSnackbar().message).not.toBe(t('setHome.needsGpsFix'))
    expect(lastSnackbar().message).toBe(t('setHome.invalidHome', { result: MavResult.MAV_RESULT_DENIED }))
    expect(lastSnackbar().message).toContain('MAV_RESULT_DENIED')
  })

  test('when PX4 refuses for another reason, says it was refused and why', async () => {
    vehicleStore.setHomeWaypoint.mockRejectedValue(
      new CommandRejectedError(MavCmd.MAV_CMD_DO_SET_HOME, MavResult.MAV_RESULT_UNSUPPORTED)
    )

    await expect(confirmSetHome([55.76, 37.62])).resolves.toBe(false)

    expect(lastSnackbar().variant).toBe('error')
    expect(lastSnackbar().message).toContain('MAV_RESULT_UNSUPPORTED')
  })

  test('when the vehicle never reports the new HOME, reports a failure, not success', async () => {
    vehicleStore.setHomeWaypoint.mockRejectedValue(new Error('The vehicle did not report the new HOME position.'))

    await expect(confirmSetHome([55.76, 37.62])).resolves.toBe(false)

    expect(lastSnackbar().variant).toBe('error')
    expect(lastSnackbar().message).toContain('The vehicle did not report the new HOME position.')
  })
})
