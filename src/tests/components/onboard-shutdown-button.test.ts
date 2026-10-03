import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

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
})
const blueos = { requestOnboardPoweroff: vi.fn(async () => undefined), getStatus: vi.fn(async () => true) }
let offline: (value: 'off' | 'timeout') => void = () => undefined
const waitUntilOffline = vi.fn(() => new Promise<'off' | 'timeout'>((resolve) => (offline = resolve)))

vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => vehicle }))
vi.mock('@/libs/blueos', () => blueos)
vi.mock('@/libs/vehicle/onboard-shutdown', async () => ({
  ...(await vi.importActual<typeof import('@/libs/vehicle/onboard-shutdown')>('@/libs/vehicle/onboard-shutdown')),
  waitUntilOffline: (...args: unknown[]) => waitUntilOffline(...(args as [])),
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

// Release 1.0, task 11
describe('the «Подготовить к выключению» button', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vehicle.isArmed = false
    vehicle.velocity = { ground: 0 }
    blueos.requestOnboardPoweroff.mockClear()
    waitUntilOffline.mockClear()
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

  test('released before 2 s: nothing is sent', async () => {
    const wrapper = render()
    await wrapper.find('button').trigger('pointerdown')
    await advance(1900)
    await wrapper.find('button').trigger('pointerup')
    await advance(2000)

    expect(blueos.requestOnboardPoweroff).not.toHaveBeenCalled()
  })

  test('armed during the hold: nothing is sent', async () => {
    const wrapper = render()
    await wrapper.find('button').trigger('pointerdown')
    await advance(1000)
    vehicle.isArmed = true
    await advance(1500)

    expect(blueos.requestOnboardPoweroff).not.toHaveBeenCalled()
  })

  test('held 2 s: BlueOS is told to power off, and the main power may go off only once it stopped answering', async () => {
    const wrapper = render()
    await wrapper.find('button').trigger('pointerdown')
    await advance(2000)
    await flush()

    expect(blueos.requestOnboardPoweroff).toHaveBeenCalledWith('192.168.2.2')
    expect(wrapper.text()).toContain(t('onboardShutdown.shuttingDown'))
    expect(wrapper.text()).not.toContain(t('onboardShutdown.canPowerOff'))

    offline('off')
    await flush()
    expect(wrapper.text()).toContain(t('onboardShutdown.canPowerOff'))
  })

  test('still answering after the wait: the operator is told not to switch the power off', async () => {
    const wrapper = render()
    await wrapper.find('button').trigger('pointerdown')
    await advance(2000)
    await flush()
    offline('timeout')
    await flush()

    expect(wrapper.text()).toContain(t('onboardShutdown.timeout'))
    expect(wrapper.text()).not.toContain(t('onboardShutdown.canPowerOff'))
  })

  test('the command fails: the error is shown and nothing says the power may go off', async () => {
    blueos.requestOnboardPoweroff.mockRejectedValueOnce(new Error('timeout'))
    const wrapper = render()
    await wrapper.find('button').trigger('pointerdown')
    await advance(2000)
    await flush()

    expect(wrapper.text()).toContain(t('onboardShutdown.failed', { error: 'Error: timeout' }))
    expect(waitUntilOffline).not.toHaveBeenCalled()
  })

  test('it is on the general settings page, next to the autopilot reboot', () => {
    const page = read('src/views/ConfigurationGeneralView.vue')
    expect(page).toMatch(/<AutopilotRebootButton \/>\s*<OnboardShutdownButton \/>/)
  })
})
