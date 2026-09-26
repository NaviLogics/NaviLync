/**
 * Date and time for the top bar clock
 * @param {Date | number} date - The time to show
 * @param {string} locale - The interface language, e.g. 'ru' or 'en'
 * @returns {string} The formatted date and time
 */
export const formatClockDateTime = (date: Date | number, locale: string): string => {
  void locale
  return String(date)
}

/**
 * Whether a data-lake variable holds a speed measured by GPS
 * @param {string} variableName - The data-lake variable
 * @returns {boolean} True for a GPS speed
 */
export const isGpsSpeedVariable = (variableName: string): boolean => {
  void variableName
  return false
}

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
 * Whether a GPS speed is worth showing
 * @param {GpsSpeedState} state - The GPS fix and the age of the data
 * @returns {boolean} True when the speed can be shown
 */
export const isGpsSpeedShowable = (state: GpsSpeedState): boolean => {
  void state
  return true
}

/**
 * The name to show for a generic indicator
 * @param {string} displayName - The name stored in the widget options
 * @param {(key: string) => string} t - The i18n translate function
 * @returns {string} The name to show
 */
export const indicatorDisplayName = (displayName: string, t: (key: string) => string): string => {
  void t
  return displayName
}

/**
 * The unit to show for a generic indicator
 * @param {string} unit - The unit stored in the widget options
 * @param {(key: string) => string} t - The i18n translate function
 * @returns {string} The unit to show
 */
export const indicatorDisplayUnit = (unit: string, t: (key: string) => string): string => {
  void t
  return unit
}
