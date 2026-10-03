import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import { i18n } from '@/plugins/i18n'
import type { MiniWidget } from '@/types/widgets'

const store = reactive({
  powerSupply: { voltage: 24.3 as number | undefined, current: 0 as number | undefined },
  instantaneousWatts: 0 as number | undefined,
  currentMeasured: false,
  lowVoltage: false,
  lowVoltageThreshold: 21 as number | undefined,
  batteryCells: 6 as number | undefined,
})
vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => store }))
vi.mock('@/stores/widgetManager', () => ({
  useWidgetManagerStore: () => ({ miniWidgetManagerVars: () => ({ configMenuOpen: false }) }),
}))
vi.mock('@/stores/appInterface', () => ({ useAppInterfaceStore: () => ({ globalGlassMenuStyles: {} }) }))
vi.mock('@/libs/sensors-logging', () => ({ datalogger: { registerUsage: vi.fn() }, DatalogVariable: {} }))

import BatteryIndicator from '@/components/mini-widgets/BatteryIndicator.vue'

const { t } = i18n.global
const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')

// The tooltip renders its text next to its activator here
const Tooltip = {
  props: ['text'],
  template: '<div><slot name="activator" :props="{}" /><p class="tooltip">{{ text }}</p></div>',
}
const render = (): ReturnType<typeof mount> =>
  mount(BatteryIndicator, {
    props: {
      miniWidget: {
        hash: 'battery',
        component: 'BatteryIndicator',
        name: 'Battery',
        options: { showCurrent: false, showPower: true },
      } as unknown as MiniWidget,
    },
    global: { plugins: [i18n], stubs: { 'v-tooltip': Tooltip, 'v-dialog': true } },
  })

// Release 1.0, task 9 (narrowed)
describe('battery widget: V / W', () => {
  test('no current over 0.5 A in the session: «— W» and «ток не измеряется», not «0.0 W»', async () => {
    store.currentMeasured = false
    store.instantaneousWatts = 0
    const wrapper = render()
    await nextTick()

    expect(wrapper.text()).toMatch(/—\s*W/)
    expect(wrapper.text()).not.toContain('0.0')
    expect(wrapper.find('.tooltip').text()).toContain('ток не измеряется')
  })

  test('the current measured once: the power is shown', async () => {
    store.currentMeasured = true
    store.instantaneousWatts = 291.6
    const wrapper = render()
    await nextTick()

    expect(wrapper.text()).toMatch(/291\.6\s*W/)
    expect(wrapper.find('.tooltip').text()).not.toContain(t('miniWidgets.batteryIndicator.currentNotMeasured'))
  })

  test('low voltage for over 3 s: the voltage is highlighted and the tooltip says why', async () => {
    store.lowVoltage = false
    const wrapper = render()
    await nextTick()
    expect(wrapper.find('.battery-voltage-low').exists()).toBe(false)

    store.lowVoltage = true
    store.powerSupply.voltage = 20.7
    await nextTick()
    expect(wrapper.find('.battery-voltage-low').text()).toBe('20.7')
    expect(wrapper.find('.tooltip').text()).toContain('Напряжение батареи ниже 21 В (6 банок × 3,5 В)')
  })

  test('the store watches the current and the voltage of the vehicle, with BAT1_N_CELLS from it', () => {
    const source = read('src/stores/mainVehicle.ts')
    expect(source).toMatch(/'BAT1_N_CELLS'/)
    expect(source).toMatch(/isCurrentMeasured\(/)
    expect(source).toMatch(/lowVoltageWatch\.update\(/)
    expect(source).toMatch(/kind: 'lowVoltage'/)
  })
})
