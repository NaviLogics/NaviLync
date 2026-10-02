import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { defaultBoatProfileHash, widgetProfiles } from '@/assets/defaults'
import { esriWorldImageryTileUrl, initialTileProvider, osmTileUrl } from '@/libs/map-tiles'
import { WidgetType } from '@/types/widgets'

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')

const onBeforeSendHeaders = vi.fn()
vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0' },
  session: {
    defaultSession: { webRequest: { onBeforeSendHeaders: (...args: unknown[]) => onBeforeSendHeaders(...args) } },
  },
}))

// Release 1.0, task 6: OSM blocks tiles without these headers
describe('OSM tile requests carry NaviLync User-Agent and Referer', () => {
  beforeEach(() => onBeforeSendHeaders.mockClear())

  test('User-Agent NaviLync/<version> (+contact) and a NaviLync Referer, for OSM tile hosts only', async () => {
    const { setupOsmRefererService } = await import('@/electron/services/osm-referer')
    setupOsmRefererService()

    const [filter, listener] = onBeforeSendHeaders.mock.calls[0]
    expect(filter.urls).toContain('https://tile.openstreetmap.org/*')
    expect(filter.urls.every((url: string) => /openstreetmap\.org|osm\.org/.test(url))).toBe(true)

    const callback = vi.fn()
    listener({ requestHeaders: { 'User-Agent': 'Mozilla/5.0 Electron', 'Accept': 'image/png' } }, callback)
    const headers = callback.mock.calls[0][0].requestHeaders
    expect(headers['User-Agent']).toBe('NaviLync/1.0.0 (+https://github.com/NaviLogics/NaviLync)')
    expect(headers['Referer']).toBe('https://github.com/NaviLogics/NaviLync')
    expect(headers['Accept']).toBe('image/png')
  })

  test('no Cockpit address goes to OSM any more', () => {
    expect(read('src/electron/services/osm-referer.ts')).not.toMatch(/bluerobotics/)
  })
})

describe('map tile sources', () => {
  test('OSM tiles come from tile.openstreetmap.org, not the a/b/c subdomains', () => {
    expect(osmTileUrl).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(esriWorldImageryTileUrl).toBe(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    )
    for (const file of ['src/components/widgets/Map.vue', 'src/views/MissionPlanningView.vue']) {
      expect(read(file)).not.toMatch(/\{s\}\.tile\.openstreetmap\.org/)
    }
  })

  // The planner added an OSM layer over whichever base map was chosen, so Esri never showed there
  test('the planner does not draw OSM over the chosen base map', () => {
    expect(read('src/views/MissionPlanningView.vue')).not.toMatch(/L\.tileLayer\(\s*osmTileUrl|L\.tileLayer\('https/)
  })
})

describe('the Navis profile opens on Esri World Imagery', () => {
  test('the map widget of the Navis profile is set to Esri World Imagery', () => {
    const navis = widgetProfiles.find((profile) => profile.hash === defaultBoatProfileHash)
    const maps = navis?.views.flatMap((view) => view.widgets).filter((widget) => widget.component === WidgetType.Map)
    expect(maps?.length).toBeGreaterThan(0)
    maps?.forEach((map) => expect(map.options.tileProvider).toBe('Esri World Imagery'))
  })

  test('a map opens on the base map of its widget, whatever was last picked on another map', () => {
    expect(initialTileProvider('Esri World Imagery', 'OpenStreetMap')).toBe('Esri World Imagery')
    expect(initialTileProvider('OpenStreetMap', 'Esri World Imagery')).toBe('OpenStreetMap')
  })

  test('a widget without its own choice (older profiles) keeps the last picked one, else Esri', () => {
    expect(initialTileProvider(undefined, 'OpenStreetMap')).toBe('OpenStreetMap')
    expect(initialTileProvider(undefined, undefined)).toBe('Esri World Imagery')
  })

  test('the flight map uses it and keeps the operator choice in the widget', () => {
    const map = read('src/components/widgets/Map.vue')
    expect(map).toMatch(/initialTileProvider\(widget\.value\.options\.tileProvider/)
    expect(map).toMatch(/widget\.value\.options\.tileProvider = /)
  })
})
