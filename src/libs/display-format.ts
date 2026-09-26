import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

/**
 * Date and time for the top bar clock
 * @param {Date | number} date - The time to show
 * @param {string} locale - The interface language, e.g. 'ru' or 'en'
 * @returns {string} The formatted date and time, e.g. «Вс 27 сент. 00:00» in Russian, "Sun Sep 27th 00:00" otherwise
 */
export const formatClockDateTime = (date: Date | number, locale: string): string => {
  if (locale !== 'ru') return format(date, 'E LLL do HH:mm')
  const text = format(date, 'EEEEEE d MMM HH:mm', { locale: ru })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Data-lake variables that hold a speed measured by GPS (legacy paths, or the end of the full MAVLink path)
const gpsSpeedVariables = ['VFR_HUD/groundspeed', 'GPS_RAW_INT/vel']

/**
 * Whether a data-lake variable holds a speed measured by GPS
 * @param {string} variableName - The data-lake variable
 * @returns {boolean} True for a GPS speed
 */
export const isGpsSpeedVariable = (variableName: string): boolean =>
  gpsSpeedVariables.some((gpsSpeed) => variableName === gpsSpeed || variableName.endsWith(`/${gpsSpeed}`))

/**
 * The data-lake variable with GPS_RAW_INT.fix_type from the same vehicle as a GPS speed variable
 * @param {string} speedVariable - A GPS speed variable, e.g. 'VFR_HUD/groundspeed' or '/mavlink/1/1/VFR_HUD/groundspeed'
 * @returns {string} The fix type variable, e.g. 'GPS_RAW_INT/fix_type' or '/mavlink/1/1/GPS_RAW_INT/fix_type'
 */
export const gpsFixVariableFor = (speedVariable: string): string =>
  speedVariable.replace(/(VFR_HUD\/groundspeed|GPS_RAW_INT\/vel)$/, 'GPS_RAW_INT/fix_type')

// GPS_FIX_TYPE values from 3D fix on (MAVLink GPS_FIX_TYPE: 3 = 3D, 4 = DGPS, 5 = RTK float, 6 = RTK fixed, ...)
const fixTypesWith3dPosition = [
  'GPS_FIX_TYPE_3D_FIX',
  'GPS_FIX_TYPE_DGPS',
  'GPS_FIX_TYPE_RTK_FLOAT',
  'GPS_FIX_TYPE_RTK_FIXED',
  'GPS_FIX_TYPE_STATIC',
  'GPS_FIX_TYPE_PPP',
]

// Older than this, a speed or a GPS fix is not shown: the vehicle may have stopped sending it
export const gpsDataMaxAgeMs = 3000

/**
 * What decides whether a GPS speed can be shown
 */
export interface GpsSpeedState {
  /** GPS_RAW_INT.fix_type as the data-lake holds it: the enum name (e.g. 'GPS_FIX_TYPE_3D_FIX') or its number */
  fixType: string | number | undefined
  /** When GPS_RAW_INT.fix_type was last updated, in performance.now() milliseconds */
  fixUpdatedAt: number | undefined
  /** When the speed was last updated, in performance.now() milliseconds */
  speedUpdatedAt: number | undefined
  /** The current time, in performance.now() milliseconds */
  now: number
}

/**
 * Whether a GPS speed is worth showing. Without a 3D fix, GPS speed is noise: a boat standing still in the lab showed
 * 8 to 91 m/s.
 * @param {GpsSpeedState} state - The GPS fix and the age of the data
 * @returns {boolean} True with a 3D fix (fix_type >= 3) and both the fix and the speed updated in the last 3 s
 */
export const isGpsSpeedShowable = ({ fixType, fixUpdatedAt, speedUpdatedAt, now }: GpsSpeedState): boolean => {
  const isFresh = (updatedAt: number | undefined): boolean =>
    updatedAt !== undefined && now - updatedAt <= gpsDataMaxAgeMs
  const has3dFix = typeof fixType === 'number' ? fixType >= 3 : fixTypesWith3dPosition.includes(fixType ?? '')
  return has3dFix && isFresh(fixUpdatedAt) && isFresh(speedUpdatedAt)
}

// Names and units of the built-in indicators, as stored in the profiles, and their translation keys
const builtInIndicatorNames: Record<string, string> = { 'Speed (GPS)': 'genericIndicator.builtIn.speedGps' }
const builtInIndicatorUnits: Record<string, string> = { 'm/s': 'genericIndicator.builtIn.metersPerSecond' }

/**
 * The name to show for a generic indicator: a built-in one in the interface language, anything else as typed
 * @param {string} displayName - The name stored in the widget options
 * @param {(key: string) => string} t - The i18n translate function
 * @returns {string} The name to show
 */
export const indicatorDisplayName = (displayName: string, t: (key: string) => string): string => {
  const key = builtInIndicatorNames[displayName]
  return key ? t(key) : displayName
}

/**
 * The unit to show for a generic indicator: a built-in one in the interface language, anything else as typed
 * @param {string} unit - The unit stored in the widget options
 * @param {(key: string) => string} t - The i18n translate function
 * @returns {string} The unit to show
 */
export const indicatorDisplayUnit = (unit: string, t: (key: string) => string): string => {
  const key = builtInIndicatorUnits[unit]
  return key ? t(key) : unit
}
