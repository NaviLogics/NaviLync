/**
 * Information about the network
 */
export interface NetworkInfo {
  /**
   * The top side address of the local machine
   */
  topSideAddress: string
  /**
   * The MAC address of the local machine
   */
  macAddress: string
  /**
   * The name of the network interface
   */
  interfaceName: string
  /**
   * The CIDR of the local machine
   */
  availableAddresses: string[]
}

/**
 * The result of one ICMP ping: `reply` when the host answered, `noReply` when it did not (no answer, or a router said
 * it is unreachable), `unavailable` when the ping could not be run (no ping program, not the desktop app, bad address)
 */
export type PingResult = 'reply' | 'noReply' | 'unavailable'
