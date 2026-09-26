import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { reactive } from 'vue'

import { MiniWidgetType } from '@/types/widgets'

const missionStore = reactive({ missionName: "Unraveling the Mariner's Mystery", lastMissionName: '' })
vi.mock('@/stores/mission', () => ({ useMissionStore: () => missionStore }))
vi.mock('@/stores/widgetManager', () => ({
  useWidgetManagerStore: () => ({ editingMode: false, miniWidgetManagerVars: () => ({ configMenuOpen: false }) }),
}))
vi.mock('@/stores/appInterface', () => ({ useAppInterfaceStore: () => ({ isOnSmallScreen: false }) }))

import MissionIdentifier from '@/components/mini-widgets/MissionIdentifier.vue'

// Branding task, item 1: the random mission name at the top left is not shown any more. The name itself is still
// kept (recordings and logs are named after it); only the top bar does not show it.
describe('mission name in the top bar', () => {
  const render = (): ReturnType<typeof mount> =>
    mount(MissionIdentifier, {
      props: {
        miniWidget: { hash: 'mission-identifier', component: MiniWidgetType.MissionIdentifier, name: '', options: {} },
      },
      global: { stubs: { 'teleport': true, 'v-dialog': true, 'FontAwesomeIcon': true } },
    })

  test('a set mission name is not shown', () => {
    missionStore.missionName = "Unraveling the Mariner's Mystery"

    expect(render().text()).not.toContain("Unraveling the Mariner's Mystery")
  })

  test('without a mission name, no random name and no edit pencil are shown', () => {
    missionStore.missionName = ''

    const wrapper = render()
    expect(wrapper.text().trim()).toBe('')
    expect(wrapper.findComponent({ name: 'FontAwesomeIcon' }).exists()).toBe(false)
  })
})
