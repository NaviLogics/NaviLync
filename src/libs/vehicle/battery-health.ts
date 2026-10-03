// Over this the battery current is taken as measured: the motor ESCs on the 24 V bus bypass the power module, which
// then reads near 0 A
export const CURRENT_MEASURED_ABOVE_A = 0.5

// Under this per cell the battery is low (6S: 21.0 V)
export const LOW_CELL_VOLTAGE = 3.5

// How long the voltage must stay under (or back over) the threshold: shorter dips under load do not count
export const LOW_VOLTAGE_AFTER_MS = 3000

/**
 * Whether a current reading shows the power module measures the current
 * @param {number | undefined} current - The battery current, in A; undefined when the vehicle sends -1 (not measured)
 * @returns {boolean} True over CURRENT_MEASURED_ABOVE_A
 */
export const isCurrentMeasured = (current: number | undefined): boolean =>
  current !== undefined && current > CURRENT_MEASURED_ABOVE_A

/**
 * The low battery voltage for a battery
 * @param {number | undefined} cells - BAT1_N_CELLS
 * @returns {number | undefined} The cells times LOW_CELL_VOLTAGE, in V; undefined without a valid cell count
 */
export const lowVoltageThreshold = (cells: number | undefined): number | undefined =>
  cells !== undefined && Number.isInteger(cells) && cells > 0 ? cells * LOW_CELL_VOLTAGE : undefined

/**
 * Tells when the battery voltage stays under the threshold for over 3 s, and when it is back over it for 3 s
 */
export class LowVoltageWatch {
  /** Whether the voltage is low now */
  low = false

  /**
   * Bring the watch up to date
   * @param {number} now - The current time, as epoch milliseconds
   * @param {number | undefined} voltage - The battery voltage, in V
   * @param {number | undefined} threshold - The low voltage, in V; undefined while the cell count is unknown
   * @returns {'started' | 'ended' | undefined} `started` when the voltage became low, `ended` when it came back
   */
  update(now: number, voltage: number | undefined, threshold: number | undefined): 'started' | 'ended' | undefined {
    if (voltage === undefined || threshold === undefined || !Number.isFinite(voltage)) {
      this.changingSince = undefined
      return undefined
    }
    // While not low, the time under the threshold counts; while low, the time back at it or over it
    const changing = this.low ? voltage >= threshold : voltage < threshold
    if (!changing) {
      this.changingSince = undefined
      return undefined
    }
    this.changingSince ??= now
    if (now - this.changingSince < LOW_VOLTAGE_AFTER_MS) return undefined
    this.changingSince = undefined
    this.low = !this.low
    return this.low ? 'started' : 'ended'
  }

  private changingSince: number | undefined
}
