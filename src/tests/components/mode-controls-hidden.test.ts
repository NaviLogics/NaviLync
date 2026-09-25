import { mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'

import { i18n } from '@/plugins/i18n'

const vehicleStore = reactive({
  canCommandModes: false,
  isVehicleOnline: true,
  flying: false as boolean | undefined,
  mode: 'Mission' as string | undefined,
  modesAvailable: () => ['Manual', 'Position', 'Mission', 'Hold', 'Return'],
  setFlightMode: vi.fn(),
  returnHome: vi.fn(async () => undefined),
  pauseMission: vi.fn(async () => undefined),
  takeoff: vi.fn(async () => undefined),
  land: vi.fn(async () => undefined),
})
const missionStore = reactive({
  isMissionRunning: false,
  canSkipToPrevWp: true,
  canSkipToNextWp: true,
  currentWaypointOnMission: 1,
  skipToWaypoint: vi.fn(),
  executeMissionOnVehicle: vi.fn(),
  callMapDownloadMissionFromVehicle: vi.fn(),
  callMapClearMapDrawing: vi.fn(),
})

vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => vehicleStore }))
vi.mock('@/stores/mission', () => ({ useMissionStore: () => missionStore }))
vi.mock('@/stores/appInterface', () => ({ useAppInterfaceStore: () => ({ globalGlassMenuStyles: {} }) }))
vi.mock('@/stores/widgetManager', () => ({
  useWidgetManagerStore: () => ({
    widgetManagerVars: () => ({ allowResizing: true }),
    allowMovingAndResizing: vi.fn(),
    editingMode: false,
  }),
}))
vi.mock('@/composables/interactionDialog', () => ({
  useInteractionDialog: () => ({ showDialog: vi.fn(), closeDialog: vi.fn() }),
}))
vi.mock('@/libs/sensors-logging', () => ({
  datalogger: { registerUsage: vi.fn() },
  DatalogVariable: { mode: 'Mode' },
}))
vi.mock('@/libs/slide-to-confirm', () => ({
  slideToConfirm: vi.fn(async () => undefined),
  canByPassCategory: vi.fn(() => true),
  EventCategory: { TAKEOFF: 'takeoff', LAND: 'land' },
}))

// Vuetify is not installed in these tests; render its building blocks as plain elements that keep the icon visible.
const stubs = {
  'v-btn': defineComponent({
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('button', { 'data-icon': props.icon }),
  }),
  'v-tooltip': { template: '<div><slot name="activator" :props="{}" /></div>' },
  'v-menu': { template: '<div><slot name="activator" :props="{}" /></div>' },
  'v-icon': { template: '<i><slot /></i>' },
  'v-divider': true,
  'v-list': true,
  'v-list-item': true,
  'v-list-item-title': true,
  'Dropdown': { template: '<select data-testid="mode-dropdown" />' },
}

const mountWithStubs = async (path: string, props: Record<string, unknown> = {}): Promise<VueWrapper> => {
  const component = (await import(path)).default
  return mount(component, { props, global: { plugins: [i18n], stubs } })
}

const missionControlPanels = [
  ['MiniMissionControlPanel', '@/components/mini-widgets/MiniMissionControlPanel.vue', {}],
  ['MissionControlPanel', '@/components/widgets/MissionControlPanel.vue', { widget: { hash: 'panel' } }],
] as const

describe('mode and mission commands are not offered where NaviLync does not command modes (PX4)', () => {
  beforeEach(() => {
    vehicleStore.canCommandModes = false
  })

  test.each(missionControlPanels)(
    '%s hides start/pause, return home and skipping between waypoints',
    async (_name, path, props) => {
      const wrapper = await mountWithStubs(path, props)

      expect(wrapper.find('[data-icon="mdi-play"]').exists()).toBe(false)
      expect(wrapper.find('[data-icon="mdi-pause"]').exists()).toBe(false)
      expect(wrapper.find('[data-icon="mdi-home-circle"]').exists()).toBe(false)
      // Skipping sends MAV_CMD_DO_SET_MISSION_CURRENT with a seq from the ArduPilot mission model (В1, fixed in T1)
      expect(wrapper.find('[data-icon="mdi-skip-previous"]').exists()).toBe(false)
      expect(wrapper.find('[data-icon="mdi-skip-next"]').exists()).toBe(false)
    }
  )

  test.each(missionControlPanels)(
    '%s keeps start/pause, return home and skipping for ArduPilot',
    async (_name, path, props) => {
      vehicleStore.canCommandModes = true
      const wrapper = await mountWithStubs(path, props)

      expect(wrapper.find('[data-icon="mdi-play"]').exists()).toBe(true)
      expect(wrapper.find('[data-icon="mdi-home-circle"]').exists()).toBe(true)
      expect(wrapper.find('[data-icon="mdi-skip-previous"]').exists()).toBe(true)
      expect(wrapper.find('[data-icon="mdi-skip-next"]').exists()).toBe(true)
    }
  )

  test('TakeoffLandCommander shows no takeoff/land button', async () => {
    const wrapper = await mountWithStubs('@/components/mini-widgets/TakeoffLandCommander.vue')

    expect(wrapper.find('button').exists()).toBe(false)
  })

  test('ModeSelector shows the current mode without a selector', async () => {
    const wrapper = await mountWithStubs('@/components/mini-widgets/ModeSelector.vue')

    expect(wrapper.find('[data-testid="mode-dropdown"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Mission')
  })

  test('ModeSelector keeps the selector for ArduPilot', async () => {
    vehicleStore.canCommandModes = true
    const wrapper = await mountWithStubs('@/components/mini-widgets/ModeSelector.vue')

    expect(wrapper.find('[data-testid="mode-dropdown"]').exists()).toBe(true)
  })
})
