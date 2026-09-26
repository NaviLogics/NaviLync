import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { reactive } from 'vue'

import { i18n } from '@/plugins/i18n'

const vehicleStore = reactive({
  homePosition: undefined as
    | {
        /** Latitude in degrees */
        latitude: number
        /** Longitude in degrees */
        longitude: number
        /** Altitude above mean sea level, in meters */
        altitude: number
      }
    | undefined,
})

vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => vehicleStore }))

const stubs = {
  'v-icon': { template: '<i class="v-icon"><slot /></i>' },
  'v-btn': { template: '<button class="v-btn"><slot /></button>' },
}

const mountItem = async (): Promise<ReturnType<typeof mount>> => {
  const HomeChecklistItem = (await import('@/components/mission-planning/HomeChecklistItem.vue')).default
  return mount(HomeChecklistItem, { global: { plugins: [i18n], stubs } })
}

describe('"Home point" item of the new mission checklist (P7)', () => {
  beforeEach(() => {
    vehicleStore.homePosition = undefined
  })

  test('is not done while the vehicle has not reported a HOME', async () => {
    const wrapper = await mountItem()

    expect(wrapper.text()).toContain(i18n.global.t('missionPlanning.homePointChecklist'))
    expect(wrapper.find('.v-icon').text()).toBe('mdi-close-circle')
  })

  test('is done once the vehicle reports a HOME, automatic or set by hand', async () => {
    vehicleStore.homePosition = { latitude: 55.75, longitude: 37.61, altitude: 12.5 }
    const wrapper = await mountItem()

    expect(wrapper.find('.v-icon').text()).toBe('mdi-check-circle')
  })

  test.each([
    ['without a HOME', undefined],
    ['with a HOME already reported', { latitude: 55.75, longitude: 37.61, altitude: 12.5 }],
  ])('offers setting HOME by hand %s', async (_case, homePosition) => {
    vehicleStore.homePosition = homePosition
    const wrapper = await mountItem()

    const button = wrapper.find('button')
    expect(button.text()).toContain(i18n.global.t('missionPlanning.setHomeManually'))
    await button.trigger('click')
    expect(wrapper.emitted('set-home')).toHaveLength(1)
  })
})
