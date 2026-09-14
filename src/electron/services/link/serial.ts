import { PortInfo } from '@serialport/bindings-cpp'
import { SerialPort } from 'serialport'

import { Link } from './link'

// We need to use the SerialPort with require here, we are importing the object
// not the type.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SerialPortObject = require('serialport').SerialPort

/**
 * Normalize a serial URI path across POSIX and Windows.
 * @param uri Serial connection URI
 * @returns Native serial port path
 */
export const normalizeSerialPath = (uri: URL): string => {
  const candidate = decodeURIComponent(uri.pathname || uri.hostname)

  if (process.platform === 'win32') {
    // WHATWG URLs commonly expose serial:///COM3 as /COM3. Windows SerialPort
    // expects COM3 (or COM10+) without the leading slash.
    return candidate.replace(/^\/+/, '')
  }

  return candidate
}

/**
 * SerialLink class for managing serial connections
 */
export class SerialLink extends Link {
  protocol: string
  path: string
  baudRate = 115200 // Default baud rate, can be adjusted as needed
  socket?: SerialPort

  /**
   * Serial Link Constructor
   * @param {URL} uri - The URI of the serial link
   * @throws {Error} If the URI is invalid or the protocol is not supported
   * @description The URI should be in the format: serial:path?baudrate=[baudrate default:115200]
   * For example: serial:///dev/ttyUSB0?baudrate=115200 or serial:///COM3?baudrate=115200
   */
  constructor(uri: URL) {
    super(uri)
    this.protocol = uri.protocol.replace(':', '')
    this.path = normalizeSerialPath(uri)
    this.baudRate = parseInt(uri.searchParams.get('baudrate') || '115200', 10)

    if (!this.path) {
      throw new Error('Serial port path is required')
    }

    if (isNaN(this.baudRate) || this.baudRate <= 0) {
      throw new Error(`Invalid baud rate: ${uri.searchParams.get('baudrate')}`)
    }
  }

  /**
   * Open the serial link
   * @returns {void}
   * @description This method creates a serial port connection using the specified path and baud rate.
   */
  async open(): Promise<void> {
    let ports: PortInfo[] | undefined

    try {
      ports = await SerialPortObject.list()
      console.log(
        'Available serial ports:',
        ports.map((p: PortInfo) => p.path)
      )
    } catch (listError: any) {
      // Port enumeration can fail on a restricted host. In that case we still
      // attempt to open the explicitly requested port and let SerialPort report
      // the authoritative open error.
      console.warn('Unable to enumerate serial ports before opening:', listError)
    }

    if (ports) {
      const requestedPath = process.platform === 'win32' ? this.path.toLowerCase() : this.path
      const portExists = ports.some((p: PortInfo) => {
        const availablePath = process.platform === 'win32' ? p.path.toLowerCase() : p.path
        return availablePath === requestedPath
      })

      if (!portExists) {
        throw new Error(`Port ${this.path} not found`)
      }
    }

    const port = new SerialPortObject({
      path: this.path,
      baudRate: this.baudRate,
      autoOpen: false,
    })

    return new Promise((resolve, reject) => {
      port.open((error: Error | null) => {
        if (error) {
          console.error(`Error opening serial port ${this.path}:`, error)
          reject(error)
          return
        }

        this.socket = port

        port.on('data', (data: Buffer) => this.emit('data', data))

        port.on('error', (inner_error: any) => {
          this.emit('error', inner_error)
        })

        port.on('close', () => {
          this.emit('close')
        })

        resolve()
      })
    })
  }

  /**
   * Close the serial link
   * @returns {Promise<void>}
   */
  async close(): Promise<void> {
    if (!this.isOpen) {
      console.warn(`Serial link on path ${this.path} is already closed.`)
      return
    }

    return new Promise((resolve, reject) => {
      this.socket?.removeAllListeners()
      this.socket?.close((error: Error | null) => {
        if (error) {
          console.error(`Error closing serial port ${this.path}:`, error)
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Write data to the serial link
   * @param {Uint8Array} data - The data to write to the serial link
   * @returns {Promise<void>}
   */
  async write(data: Uint8Array): Promise<void> {
    if (!this.isOpen) {
      console.warn(`Serial link on path ${this.path} is already closed.`)
      return
    }

    return new Promise((resolve, reject) => {
      this.socket!.write(Buffer.from(data), (error: Error | null | undefined) => {
        if (error) {
          console.error(`Error writing to serial port ${this.path}:`, error)
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Check if the serial link is open
   * @returns {boolean}
   */
  get isOpen(): boolean {
    return this.socket?.isOpen ?? false
  }
}
