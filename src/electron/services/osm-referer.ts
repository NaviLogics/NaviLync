import { app, session } from 'electron'

/**
 * Public-facing URL of NaviLync, sent as the Referer and as the contact in the User-Agent of OSM tile requests.
 *
 * Per the OSM tile usage policy the application must identify itself with a User-Agent of its own and send an
 * accurate Referer; without them OSM serves blocked-tile placeholders.
 * @see https://operations.osmfoundation.org/policies/tiles/
 */
const NAVILYNC_URL = 'https://github.com/NaviLogics/NaviLync'

/**
 * URL filter matching every known OSM tile host. The canonical policy-compliant URL is
 * `https://tile.openstreetmap.org/...`, but the legacy `{s}.tile.openstreetmap.org` subdomains
 * are still in use inside some offline caches, so we cover both.
 */
const OSM_TILE_URL_FILTER = {
  urls: [
    'https://tile.openstreetmap.org/*',
    'https://*.tile.openstreetmap.org/*',
    'https://tile.osm.org/*',
    'https://*.tile.osm.org/*',
  ],
}

/**
 * Setup a webRequest interceptor that sets the NaviLync User-Agent and Referer headers on every request to
 * OpenStreetMap tile servers.
 *
 * When NaviLync is loaded from `file://` (standalone/Electron build), the document origin is
 * `"null"` and Chromium omits the Referer header for cross-origin tile requests regardless of
 * the `referrerPolicy` set on the tile `<img>` element. Without a Referer, OSM serves a
 * "403R — Referer is required" blocked-tile placeholder (with a 200 status code and
 * `X-Blocked` response header) per their tile usage policy.
 *
 * This listener sets them only for OSM tile hosts so other
 * request flows are unaffected.
 * @returns {void}
 */
export const setupOsmRefererService = (): void => {
  session.defaultSession.webRequest.onBeforeSendHeaders(OSM_TILE_URL_FILTER, (details, callback) => {
    const requestHeaders = {
      ...details.requestHeaders,
      'User-Agent': `NaviLync/${app.getVersion()} (+${NAVILYNC_URL})`,
      'Referer': NAVILYNC_URL,
    }
    callback({ requestHeaders })
  })
}
