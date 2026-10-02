import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import { i18n } from '@/plugins/i18n'

const vehicle = reactive({ isArmed: false as boolean | undefined, rebootAutopilot: vi.fn(async () => undefined) })
const dialog = { showDialog: vi.fn(), closeDialog: vi.fn() }

vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => vehicle }))
vi.mock('@/composables/interactionDialog', () => ({ useInteractionDialog: () => dialog }))

import AutopilotRebootButton from '@/components/AutopilotRebootButton.vue'

const { t } = i18n.global

const VBtn = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}
const render = (): ReturnType<typeof mount> =>
  mount(AutopilotRebootButton, { global: { plugins: [i18n], stubs: { 'v-btn': VBtn } } })

// Release 1.0, task 5: after a software reboot the Pixhawk hung until its power was removed
describe('autopilot reboot button', () => {
  beforeEach(() => {
    vehicle.isArmed = false
    vehicle.rebootAutopilot.mockClear()
    dialog.showDialog.mockClear()
  })

  test('armed → the button is not available', async () => {
    vehicle.isArmed = true
    const wrapper = render()
    await nextTick()

    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  test('arming state unknown (no vehicle) → not available either', async () => {
    vehicle.isArmed = undefined
    const wrapper = render()
    await nextTick()

    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  test('disarmed → asks for confirmation with the warning, and reboots only when confirmed', async () => {
    const wrapper = render()
    await wrapper.find('button').trigger('click')

    expect(dialog.showDialog).toHaveBeenCalledTimes(1)
    const options = dialog.showDialog.mock.calls[0][0]
    expect(options.message).toBe(
      'Программная перезагрузка может привести к зависанию. Рекомендуется перезагрузка главным выключателем.'
    )
    expect(vehicle.rebootAutopilot).not.toHaveBeenCalled()

    const confirm = options.actions.find(
      (action: {
        /**
         *
         */
        text: string
      }) => action.text === t('autopilotReboot.confirm')
    )
    await confirm.action()
    expect(vehicle.rebootAutopilot).toHaveBeenCalledTimes(1)
  })

  test('cancel does not reboot', async () => {
    const wrapper = render()
    await wrapper.find('button').trigger('click')

    const options = dialog.showDialog.mock.calls[0][0]
    const cancel = options.actions.find(
      (action: {
        /**
         *
         */
        text: string
      }) => action.text === t('autopilotReboot.cancel')
    )
    await cancel.action()
    expect(vehicle.rebootAutopilot).not.toHaveBeenCalled()
  })

  test('the button is on the general settings page, for the bench', () => {
    const view = readFileSync(join(process.cwd(), 'src/views/ConfigurationGeneralView.vue'), 'utf8')
    expect(view).toMatch(/<AutopilotRebootButton\s*\/>/)
  })
})
