import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { openSnackbar, useSnackbar } from '@/composables/snackbar'

// Release 1.0, task 11: the outcome of the onboard computer shutdown stays on screen until the operator closes it
describe('snackbar duration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useSnackbar().snackbars.splice(0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('a duration removes the snackbar once it is over', () => {
    openSnackbar({ message: 'saved', variant: 'success', duration: 3000 })
    vi.advanceTimersByTime(3000)
    expect(useSnackbar().snackbars).toHaveLength(0)
  })

  test('-1 keeps it until it is closed (Vuetify timeout -1)', () => {
    openSnackbar({ message: 'Можно выключать главный выключатель', variant: 'success', duration: -1 })
    vi.advanceTimersByTime(600_000)
    expect(useSnackbar().snackbars.map((snackbar) => snackbar.duration)).toEqual([-1])
  })
})
