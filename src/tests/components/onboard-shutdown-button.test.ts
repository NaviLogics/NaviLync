import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import type { ShutdownStage, ShutdownSteps } from '@/libs/vehicle/onboard-shutdown'
import { i18n } from '@/plugins/i18n'

const vehicle = reactive({
  isArmed: false as boolean | undefined,
  velocity: { ground: 0 } as {
    /**
     *
     */
    ground?: number
  },
  globalAddress: '192.168.2.2',
  logSessionEvent: vi.fn(),
})
const blueos = { requestOnboardPoweroff: vi.fn(async () => undefined), getStatus: vi.fn(async () => true) }

/**
 * A dialog the button asked for
 */
interface Dialog {
  /** Its text */
  message: string
  /** Its buttons */
  actions: {
    /**
     *
     */
    text: string
    /**
     *
     */
    action: () => unknown
  }[]
}
const dialogs: Dialog[] = []
const closeDialog = vi.fn()
const openSnackbar = vi.fn()
vi.mock('@/composables/snackbar', () => ({ openSnackbar: (options: unknown) => openSnackbar(options) }))
vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({ showDialog: (dialog: Dialog) => dialogs.push(dialog), closeDialog }),
}))

let steps: ShutdownSteps | undefined
const shutDownOnboardComputer = vi.fn((given: ShutdownSteps) => {
  steps = given
  return new Promise<ShutdownStage>(() => undefined)
})

vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => vehicle }))
vi.mock('@/libs/blueos', () => blueos)
vi.mock('@/libs/vehicle/onboard-shutdown', async () => ({
  ...(await vi.importActual<typeof import('@/libs/vehicle/onboard-shutdown')>('@/libs/vehicle/onboard-shutdown')),
  shutDownOnboardComputer: (given: ShutdownSteps) => shutDownOnboardComputer(given),
}))

import OnboardShutdownButton from '@/components/OnboardShutdownButton.vue'

const { t } = i18n.global
const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')

const VBtn = {
  props: ['disabled', 'title'],
  template: '<button :disabled="disabled" :title="title" v-bind="$attrs"><slot /></button>',
}
const render = (): ReturnType<typeof mount> =>
  mount(OnboardShutdownButton, { global: { plugins: [i18n], stubs: { 'v-btn': VBtn } } })
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
  await nextTick()
}

// vitest 0.20 has no advanceTimersByTimeAsync: move the clock in small steps and let the promises run in between
const advance = async (ms: number): Promise<void> => {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    vi.advanceTimersByTime(Math.min(100, ms - elapsed))
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }
}

const hold = async (wrapper: ReturnType<typeof mount>, ms = 2000): Promise<void> => {
  await wrapper.find('button').trigger('pointerdown')
  await advance(ms)
  await flush()
}

const press = async (dialog: Dialog, text: string): Promise<void> => {
  await dialog.actions.find((action) => action.text === text)?.action()
  await flush()
}

// Held 2 s and confirmed in the dialog
const confirmShutdown = async (wrapper: ReturnType<typeof mount>): Promise<ShutdownSteps> => {
  await hold(wrapper)
  await press(dialogs[0], t('onboardShutdown.confirm'))
  return steps as ShutdownSteps
}

const report = async (stage: ShutdownStage): Promise<void> => {
  steps?.onStage(stage)
  await flush()
}

const electronWindow = window as unknown as {
  /**
   *
   */
  electronAPI?: unknown
}

// Release 1.0, task 11
describe('the «Подготовить к выключению» button', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vehicle.isArmed = false
    vehicle.velocity = { ground: 0 }
    vehicle.logSessionEvent.mockClear()
    openSnackbar.mockClear()
    blueos.requestOnboardPoweroff.mockClear()
    blueos.getStatus.mockClear()
    shutDownOnboardComputer.mockClear()
    dialogs.length = 0
    steps = undefined
    delete electronWindow.electronAPI
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('armed or arming unknown: not available, and says why', async () => {
    vehicle.isArmed = true
    const wrapper = render()
    await nextTick()
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button').attributes('title')).toBe(t('onboardShutdown.notDisarmed'))

    vehicle.isArmed = undefined
    await nextTick()
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  test('moving at 0.2 m/s or more, or speed unknown: not available', async () => {
    vehicle.velocity = { ground: 0.3 }
    const wrapper = render()
    await nextTick()
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button').attributes('title')).toBe(t('onboardShutdown.moving'))

    vehicle.velocity = {}
    await nextTick()
    expect(wrapper.find('button').attributes('title')).toBe(t('onboardShutdown.speedUnknown'))
  })

  test('released before 2 s: no dialog, nothing is sent', async () => {
    const wrapper = render()
    await wrapper.find('button').trigger('pointerdown')
    await advance(1900)
    await wrapper.find('button').trigger('pointerup')
    await advance(2000)

    expect(dialogs).toHaveLength(0)
    expect(shutDownOnboardComputer).not.toHaveBeenCalled()
  })

  test('armed during the hold: no dialog', async () => {
    const wrapper = render()
    await wrapper.find('button').trigger('pointerdown')
    await advance(1000)
    vehicle.isArmed = true
    await advance(1500)

    expect(dialogs).toHaveLength(0)
  })

  test('held 2 s: the dialog warns about the echo sounder and the link; cancel sends nothing', async () => {
    const wrapper = render()
    await hold(wrapper)

    expect(dialogs).toHaveLength(1)
    expect(dialogs[0].message).toBe(
      'Бортовой компьютер будет выключен. Остановите запись эхолота. ' +
        'После выключения связь с аппаратом пропадёт до включения питания.'
    )
    await press(dialogs[0], t('onboardShutdown.cancel'))
    expect(shutDownOnboardComputer).not.toHaveBeenCalled()
  })

  test('armed while the dialog is open: confirming sends nothing', async () => {
    const wrapper = render()
    await hold(wrapper)
    vehicle.isArmed = true
    await press(dialogs[0], t('onboardShutdown.confirm'))

    expect(shutDownOnboardComputer).not.toHaveBeenCalled()
  })

  test('confirmed: BlueOS power off, BlueOS /status and the ping of the main process, all to the vehicle', async () => {
    const pingHost = vi.fn(async () => 'reply')
    electronWindow.electronAPI = { pingHost }
    const wrapper = render()
    const given = await confirmShutdown(wrapper)

    await given.powerOff()
    expect(blueos.requestOnboardPoweroff).toHaveBeenCalledWith('192.168.2.2')
    await given.status()
    expect(blueos.getStatus).toHaveBeenCalledWith('192.168.2.2')
    await expect(given.ping()).resolves.toBe('reply')
    expect(pingHost).toHaveBeenCalledWith('192.168.2.2')
  })

  test('in the browser (Lite) there is no ping: unavailable, so BlueOS /status is used', async () => {
    const wrapper = render()
    const given = await confirmShutdown(wrapper)
    await expect(given.ping()).resolves.toBe('unavailable')
  })

  test('ping path: «выключается…», «завершает работу… N с», then the main power with the Raspberry Pi light', async () => {
    const wrapper = render()
    await confirmShutdown(wrapper)

    await report({ kind: 'shuttingDown', detection: 'ping' })
    expect(wrapper.text()).toContain(t('onboardShutdown.shuttingDown'))
    expect(wrapper.text()).not.toContain(t('onboardShutdown.noPing'))
    expect(vehicle.logSessionEvent).toHaveBeenLastCalledWith({
      kind: 'onboardShutdown',
      stage: 'commandSent',
      detection: 'ping',
    })

    await report({ kind: 'finishing', secondsLeft: 7 })
    expect(wrapper.text()).toContain(t('onboardShutdown.finishing', { seconds: 7 }))
    expect(wrapper.text()).not.toContain(t('onboardShutdown.canPowerOff'))

    await report({ kind: 'off' })
    expect(wrapper.text()).toContain('Можно выключать главный выключатель. Убедитесь, что индикатор Raspberry Pi погас')
    expect(vehicle.logSessionEvent).toHaveBeenLastCalledWith({
      kind: 'onboardShutdown',
      stage: 'off',
      detection: 'ping',
    })
  })

  test('still answering after 90 s: the operator is told not to switch the power off, and the journal says so', async () => {
    const wrapper = render()
    await confirmShutdown(wrapper)
    await report({ kind: 'shuttingDown', detection: 'status' })
    // Without ping the operator is told why the wait is longer (the browser, or no ping on the system)
    expect(wrapper.text()).toContain(t('onboardShutdown.noPing'))
    await report({ kind: 'timeout' })

    expect(wrapper.text()).toContain(t('onboardShutdown.timeout'))
    expect(wrapper.text()).not.toContain(t('onboardShutdown.canPowerOff'))
    expect(vehicle.logSessionEvent).toHaveBeenLastCalledWith({
      kind: 'onboardShutdown',
      stage: 'timeout',
      detection: 'status',
    })
  })

  test('the command fails: the error is shown and logged', async () => {
    const wrapper = render()
    await confirmShutdown(wrapper)
    await report({ kind: 'failed', error: 'Error: timeout' })

    expect(wrapper.text()).toContain(t('onboardShutdown.failed', { error: 'Error: timeout' }))
    expect(vehicle.logSessionEvent).toHaveBeenLastCalledWith({
      kind: 'onboardShutdown',
      stage: 'failed',
      error: 'Error: timeout',
    })
  })

  // The operator may have left the settings page by the time the onboard computer is off
  test.each([
    [
      'off',
      { kind: 'off' } as ShutdownStage,
      'success',
      'Можно выключать главный выключатель. Убедитесь, что индикатор Raspberry Pi погас',
    ],
    ['timeout', { kind: 'timeout' } as ShutdownStage, 'warning', t('onboardShutdown.timeout')],
    [
      'failed',
      { kind: 'failed', error: 'Error: timeout' } as ShutdownStage,
      'error',
      t('onboardShutdown.failed', { error: 'Error: timeout' }),
    ],
  ])('the outcome %s is a snackbar on any page, kept until closed', async (_, outcome, variant, message) => {
    const wrapper = render()
    await confirmShutdown(wrapper)
    await report({ kind: 'shuttingDown', detection: 'ping' })
    await report({ kind: 'finishing', secondsLeft: 3 })
    expect(openSnackbar).not.toHaveBeenCalled()

    wrapper.unmount()
    await report(outcome)

    expect(openSnackbar).toHaveBeenCalledTimes(1)
    expect(openSnackbar).toHaveBeenCalledWith({ message, variant, duration: -1, closeButton: true })
  })

  test('it is on the general settings page, next to the autopilot reboot', () => {
    const page = read('src/views/ConfigurationGeneralView.vue')
    expect(page).toMatch(/<AutopilotRebootButton \/>\s*<OnboardShutdownButton \/>/)
  })
})
