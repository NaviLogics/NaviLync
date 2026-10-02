import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import { i18n } from '@/plugins/i18n'

const vehicle = reactive({
  isVehicleOnline: true,
  mode: 'Mission' as string | undefined,
  // The GPS status the header shows (from GPS_RAW_INT); receivedAt is when it arrived in NaviLync
  statusGPS: {} as {
    /**
     *
     */
    fixTypeNumber?: number
    /**
     *
     */
    horizontalAccuracyCm?: number
    /**
     *
     */
    receivedAt?: number
  },
})
const values: Record<string, number> = {}
let probe = { reachable: true, latencyMs: 12 }

vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => vehicle }))
vi.mock('@/libs/actions/data-lake', () => ({
  getAllDataLakeVariablesInfo: () =>
    Object.fromEntries(Object.keys(values).map((name) => [`1/1/NAMED_VALUE_FLOAT/${name}`, {}])),
  getDataLakeVariableData: (id: string) => values[id.split('/').pop() ?? ''],
  getDataLakeVariableLastUpdateTimestamp: () => performance.now(),
}))

import NavisAtlasStatus from '@/components/widgets/NavisAtlasStatus.vue'

const { t } = i18n.global

const render = async (): Promise<ReturnType<typeof mount>> => {
  const wrapper = mount(NavisAtlasStatus, { global: { plugins: [i18n] } })
  for (let i = 0; i < 5; i += 1) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return wrapper
}

const rowValue = (wrapper: ReturnType<typeof mount>, label: string): string | undefined =>
  wrapper
    .findAll('.row')
    .find((row) => row.find('.label').text() === label)
    ?.find('.value')
    .text()

// Bench, run 56: without a link to the vehicle the widget kept showing values, and a latency next to FAIL
describe('NAVIS ATLAS status widget (bench)', () => {
  beforeEach(() => {
    vehicle.isVehicleOnline = true
    vehicle.mode = 'Mission'
    Object.assign(values, {
      SHOREOK: 1,
      RTCMOK: 1,
      RTCMAGE: 1,
      RTK_BPS: 500,
      FIXTYPE: 6,
      GPSAGE: 1,
      READY: 1,
      RDYCODE: 0,
    })
    probe = { reachable: true, latencyMs: 12 }
    ;(
      window as {
        /**
         *
         */
        electronAPI?: unknown
      }
    ).electronAPI = { checkHostReachability: async () => probe }
  })

  afterEach(() => {
    delete (
      window as {
        /**
         *
         */
        electronAPI?: unknown
      }
    ).electronAPI
  })

  test('without a link to the vehicle the header says НЕТ СВЯЗИ in red and every row shows —', async () => {
    vehicle.isVehicleOnline = false

    const wrapper = await render()

    const header = wrapper.find('.header')
    expect(header.text()).toContain(t('navisAtlasStatus.noLink'))
    expect(header.find('.fail').exists()).toBe(true)
    const shown = wrapper.findAll('.row .value').map((value) => value.text())
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.every((value) => value === '—')).toBe(true)
    // Labels such as "MISSION READY" stay; only values and the readiness line are checked
    expect(wrapper.find('.reason').text()).not.toMatch(/\bOK\b|FAIL|STARTUP|STALE|\d/)
  })

  test('with the link, the header shows the system status as before', async () => {
    const wrapper = await render()

    expect(wrapper.find('.header').text()).toContain(t('navisAtlasStatus.systemStatus'))
    expect(wrapper.find('.header').text()).not.toContain(t('navisAtlasStatus.noLink'))
  })

  test('a Shore↔USV link that fails is shown as FAIL without a latency', async () => {
    values.SHOREOK = 0

    const wrapper = await render()

    expect(rowValue(wrapper, t('navisAtlasStatus.rows.shoreLink'))).toBe(t('navisAtlasStatus.values.fail'))
  })

  test('a Shore↔USV link that works is shown as OK with its latency', async () => {
    const wrapper = await render()

    expect(rowValue(wrapper, t('navisAtlasStatus.rows.shoreLink'))).toBe(`${t('navisAtlasStatus.values.ok')} 12 ms`)
  })
})

// Release 1.0, task 4: on the pilot video the widget showed «—» for GNSS and RTK while the header read RTK Fixed
describe('NAVIS ATLAS GNSS and RTK rows come from the GPS status of the header', () => {
  const gnss = (wrapper: ReturnType<typeof mount>): string | undefined =>
    rowValue(wrapper, t('navisAtlasStatus.rows.gnssRover'))
  const rtk = (wrapper: ReturnType<typeof mount>): string | undefined =>
    rowValue(wrapper, t('navisAtlasStatus.rows.rtkFixed'))

  beforeEach(() => {
    vehicle.isVehicleOnline = true
    // The NAVIS agent's own FIXTYPE and GPSAGE are not sent, as on the pilot
    Object.keys(values).forEach((name) => delete values[name])
    Object.assign(values, { SHOREOK: 1, READY: 1, RDYCODE: 0 })
  })

  test('RTK fixed received 1 s ago: GNSS OK, RTK FIXED', async () => {
    vehicle.statusGPS = { fixTypeNumber: 6, receivedAt: performance.now() - 1000 }
    const wrapper = await render()

    expect(gnss(wrapper)).toBe(t('navisAtlasStatus.values.ok'))
    expect(rtk(wrapper)).toBe(t('navisAtlasStatus.values.fixed'))
  })

  test('RTK float: GNSS OK, RTK FLOAT', async () => {
    vehicle.statusGPS = { fixTypeNumber: 5, receivedAt: performance.now() - 1000 }
    const wrapper = await render()

    expect(gnss(wrapper)).toBe(t('navisAtlasStatus.values.ok'))
    expect(rtk(wrapper)).toBe(t('navisAtlasStatus.values.float'))
  })

  test('a 3D fix without RTK: GNSS OK, RTK FAIL', async () => {
    vehicle.statusGPS = { fixTypeNumber: 3, receivedAt: performance.now() - 1000 }
    const wrapper = await render()

    expect(gnss(wrapper)).toBe(t('navisAtlasStatus.values.ok'))
    expect(rtk(wrapper)).toBe(t('navisAtlasStatus.values.fail'))
  })

  test('received 4 s ago (over the 3 s limit): both «—»', async () => {
    vehicle.statusGPS = { fixTypeNumber: 6, receivedAt: performance.now() - 4000 }
    const wrapper = await render()

    expect(gnss(wrapper)).toBe('—')
    expect(rtk(wrapper)).toBe('—')
  })

  test('nothing received yet: both «—»', async () => {
    vehicle.statusGPS = {}
    const wrapper = await render()

    expect(gnss(wrapper)).toBe('—')
    expect(rtk(wrapper)).toBe('—')
  })

  test('with MAVLink v2 the horizontal accuracy is shown in cm next to the RTK state', async () => {
    vehicle.statusGPS = { fixTypeNumber: 6, horizontalAccuracyCm: 2.3, receivedAt: performance.now() - 1000 }
    const wrapper = await render()

    expect(rtk(wrapper)).toBe(`${t('navisAtlasStatus.values.fixed')} 2 cm`)
  })

  test('the widget reads the fix from the store, not from NAMED_VALUE FIXTYPE', () => {
    const widget = readFileSync(join(process.cwd(), 'src/components/widgets/NavisAtlasStatus.vue'), 'utf8')
    expect(widget).toMatch(/vehicle\.statusGPS/)
    expect(widget).not.toMatch(/metric\('FIXTYPE'\)|metric\('GPSAGE'\)/)
  })
})
