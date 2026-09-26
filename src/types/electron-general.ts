/**
 * Interface for the electron log
 */
export interface ElectronLog {
  /**
   * The size of the log file in bytes
   */
  size: number
  /**
   * The path to the log file
   */
  path: string
  /**
   * The initial time when logging started
   */
  initialTime: string
  /**
   * The initial date when logging started
   */
  initialDate: string
}

/**
 * A file download that Electron finished, e.g. an exported profile
 */
export interface FinishedDownload {
  /**
   * Where the file was saved; empty when it was not saved
   */
  path: string
  /**
   * The name of the file
   */
  fileName: string
  /**
   * How the download ended
   */
  state: 'completed' | 'cancelled' | 'interrupted'
}
