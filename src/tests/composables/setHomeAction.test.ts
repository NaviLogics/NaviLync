import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { DialogOptions } from '@/composables/interactionDialog'

const dialogs: DialogOptions[] = []
const vehicleStore = {
  homePosition: [55.75, 37.61] as [number, number] | undefined,
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

describe('explicit "Set HOME" action (K1)', () => {
  beforeEach(() => {
    dialogs.length = 0
    vehicleStore.homePosition = [55.75, 37.61]
    vehicleStore.setHomeWaypoint.mockReset()
    vehicleStore.setHomeWaypoint.mockResolvedValue(undefined)
    openSnackbar.mockReset()
  })

  test('asks for confirmation showing the current and the new HOME before sending anything', async () => {
    const { requestSetHome } = useSetHomeAction()

    void requestSetHome([55.7612345, 37.6212345])
    await flushPromises()

    const message = [lastDialog().message].flat().join('\n')
    expect(message).toContain('55.7500000, 37.6100000')
    expect(message).toContain('55.7612345, 37.6212345')
    expect(lastDialog().actions).toHaveLength(2)
    expect(vehicleStore.setHomeWaypoint).not.toHaveBeenCalled()
  })

  test('does not send anything when the operator cancels', async () => {
    const { requestSetHome } = useSetHomeAction()

    const result = requestSetHome([55.76, 37.62])
    await flushPromises()
    pressDialogButton(0)

    await expect(result).resolves.toBe(false)
    expect(vehicleStore.setHomeWaypoint).not.toHaveBeenCalled()
  })

  test('sends the new HOME only after the operator confirms', async () => {
    const { requestSetHome } = useSetHomeAction()

    const result = requestSetHome([55.76, 37.62])
    await flushPromises()
    pressDialogButton(1)

    await expect(result).resolves.toBe(true)
    expect(vehicleStore.setHomeWaypoint).toHaveBeenCalledOnce()
    expect(vehicleStore.setHomeWaypoint).toHaveBeenCalledWith([55.76, 37.62], 0)
    expect(openSnackbar).toHaveBeenLastCalledWith(expect.objectContaining({ variant: 'success' }))
  })

  test('reports a failure, not success, when the vehicle does not confirm the new HOME', async () => {
    vehicleStore.setHomeWaypoint.mockRejectedValue(new Error('Vehicle did not confirm the new HOME.'))
    const { requestSetHome } = useSetHomeAction()

    const result = requestSetHome([55.76, 37.62])
    await flushPromises()
    pressDialogButton(1)

    await expect(result).resolves.toBe(false)
    expect(openSnackbar).toHaveBeenLastCalledWith(expect.objectContaining({ variant: 'error' }))
  })
})
