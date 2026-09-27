import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import { i18n } from '@/plugins/i18n'

const vehicle = reactive({ isVehicleOnline: true, mode: 'Mission' as string | undefined })
const values: Record<string, number> = {}
// How long ago each metric last arrived, in ms; 0 when not set
const ages: Record<string, number> = {}
let probe: {
  /**
lllllllllllll *
lllllllllllll
   */
  reachable: boolean
  /**
rrrrrrrrrrrrrrrrrrrr *
rrrrrrrrrrrrrrrrrrrr
   */
  latencyMs?: number
} = { reachable: true, latencyMs: 12 }

vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => vehicle }))
vi.mock('@/libs/actions/data-lake', () => ({
  getAllDataLakeVariablesInfo: () =>
    Object.fromEntries(Object.keys(values).map((name) => [`1/1/NAMED_VALUE_FLOAT/${name}`, {}])),
  getDataLakeVariableData: (id: string) => values[id.split('/').pop() ?? ''],
  getDataLakeVariableLastUpdateTimestamp: (id: string) => performance.now() - (ages[id.split('/').pop() ?? ''] ?? 0),
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
    Object.keys(ages).forEach((name) => delete ages[name])
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

  test('without a link to the vehicle the header says НЕТ СВЯЗИ in red and every MAVLink row shows —', async () => {
    vehicle.isVehicleOnline = false

    const wrapper = await render()

    const header = wrapper.find('.header')
    expect(header.text()).toContain(t('navisAtlasStatus.noLink'))
    expect(header.find('.fail').exists()).toBe(true)
    // The Shore↔USV row is the exception: it is the ping of the radio, not a MAVLink value (bench, run 58)
    const shown = wrapper
      .findAll('.row')
      .filter((row) => row.find('.label').text() !== t('navisAtlasStatus.rows.shoreLink'))
      .map((row) => row.find('.value').text())
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

  test('a Shore↔USV link that works is shown as OK with its latency', async () => {
    const wrapper = await render()

    expect(rowValue(wrapper, t('navisAtlasStatus.rows.shoreLink'))).toBe(`${t('navisAtlasStatus.values.ok')} 12 ms`)
  })
})

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

// One probe of 192.168.9.10 every 2 s, plus the 500 ms refresh of the rows
const nextProbe = async (): Promise<void> => {
  vi.advanceTimersByTime(2000)
  await flush()
  await nextTick()
}

// Bench, run 58: the link row read FAIL while 192.168.9.10 answered in 3-7 ms, as it also required SHOREOK
describe('NAVIS ATLAS Shore↔USV link row (bench, run 58)', () => {
  const shoreLink = (wrapper: ReturnType<typeof mount>): string | undefined =>
    rowValue(wrapper, t('navisAtlasStatus.rows.shoreLink'))
  const ok = (latencyMs: number): string => `${t('navisAtlasStatus.values.ok')} ${latencyMs} ms`

  beforeEach(() => {
    vi.useFakeTimers()
    vehicle.isVehicleOnline = true
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
    Object.keys(ages).forEach((name) => delete ages[name])
    probe = { reachable: true, latencyMs: 5 }
    ;(
      window as {
        /**
         * The Electron API; only the reachability probe is used here
         */
        electronAPI?: unknown
      }
    ).electronAPI = { checkHostReachability: async () => probe }
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (
      window as {
        /**
         * The Electron API; only the reachability probe is used here
         */
        electronAPI?: unknown
      }
    ).electronAPI
  })

  const mountWidget = async (): Promise<ReturnType<typeof mount>> => {
    const wrapper = mount(NavisAtlasStatus, { global: { plugins: [i18n] } })
    await flush()
    await nextTick()
    return wrapper
  }

  test('192.168.9.10 answers: OK with the latency, whatever SHOREOK says', async () => {
    values.SHOREOK = 0
    const wrapper = await mountWidget()

    expect(shoreLink(wrapper)).toBe(ok(5))
    // SHOREOK is shown only in its own row
    expect(rowValue(wrapper, t('navisAtlasStatus.rows.shoreHealth'))).toBe(t('navisAtlasStatus.values.fail'))
  })

  test('192.168.9.10 answers while SHOREOK is not sent at all: still OK with the latency', async () => {
    delete values.SHOREOK
    const wrapper = await mountWidget()

    expect(shoreLink(wrapper)).toBe(ok(5))
    expect(rowValue(wrapper, t('navisAtlasStatus.rows.shoreHealth'))).toBe('—')
    values.SHOREOK = 1
  })

  test('FAIL, without a latency, only after 3 probes in a row get no answer (~6 s)', async () => {
    const wrapper = await mountWidget()
    expect(shoreLink(wrapper)).toBe(ok(5))

    probe = { reachable: false }
    await nextProbe()
    expect(shoreLink(wrapper)).toBe(ok(5))
    await nextProbe()
    expect(shoreLink(wrapper)).toBe(ok(5))
    await nextProbe()
    expect(shoreLink(wrapper)).toBe(t('navisAtlasStatus.values.fail'))
  })

  test('one or two lost probes between answers never show FAIL', async () => {
    const wrapper = await mountWidget()

    for (let i = 0; i < 5; i += 1) {
      probe = { reachable: false }
      await nextProbe()
      await nextProbe()
      expect(shoreLink(wrapper)).toBe(ok(5))
      probe = { reachable: true, latencyMs: 5 }
      await nextProbe()
      expect(shoreLink(wrapper)).toBe(ok(5))
    }
  })

  test('after FAIL, the first answer brings OK and the latency back', async () => {
    probe = { reachable: false }
    const wrapper = await mountWidget()
    await nextProbe()
    await nextProbe()
    expect(shoreLink(wrapper)).toBe(t('navisAtlasStatus.values.fail'))

    probe = { reachable: true, latencyMs: 4 }
    await nextProbe()
    expect(shoreLink(wrapper)).toBe(ok(4))
  })

  test('the row keeps showing the ping while MAVLink is lost, as the ping does not go through MAVLink', async () => {
    vehicle.isVehicleOnline = false
    const wrapper = await mountWidget()

    expect(shoreLink(wrapper)).toBe(ok(5))
    expect(rowValue(wrapper, t('navisAtlasStatus.rows.shoreHealth'))).toBe('—')
  })
})

// Bench, run 58: the NAMED_VALUE metrics are fresh for 5 s after their last message (was 3 s)
describe('NAVIS ATLAS metric freshness (bench, run 58)', () => {
  beforeEach(() => {
    vehicle.isVehicleOnline = true
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
    Object.keys(ages).forEach((name) => delete ages[name])
  })

  test('a metric that arrived 4.5 s ago is still shown', async () => {
    ages.SHOREOK = 4500
    const wrapper = await render()

    expect(rowValue(wrapper, t('navisAtlasStatus.rows.shoreHealth'))).toBe(t('navisAtlasStatus.values.ok'))
  })

  test('a metric that arrived 5.5 s ago is stale and shown as —', async () => {
    ages.SHOREOK = 5500
    const wrapper = await render()

    expect(rowValue(wrapper, t('navisAtlasStatus.rows.shoreHealth'))).toBe('—')
  })
})
