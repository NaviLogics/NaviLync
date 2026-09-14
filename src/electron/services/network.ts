import { ipcMain } from 'electron'
import { networkInterfaces } from 'os'

import { NetworkInfo } from '../../types/network'

const MAX_DISCOVERY_ADDRESSES = 4094

/**
 * Convert an IPv4 address to an unsigned 32-bit integer.
 * @param address IPv4 address in dotted-decimal form
 * @returns Unsigned 32-bit integer representation
 */
const ipv4ToInt = (address: string): number => {
  const octets = address.split('.').map((part) => Number(part))
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    throw new Error(`Invalid IPv4 address: ${address}`)
  }

  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0
}

/**
 * Convert an unsigned 32-bit integer to a dotted-decimal IPv4 address.
 * @param value Unsigned 32-bit integer
 * @returns IPv4 address
 */
const intToIpv4 = (value: number): string =>
  [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join('.')

/**
 * Return usable host addresses for a subnet.
 * Large networks are deliberately not expanded into tens of thousands of
 * probe targets; discovery falls back to manual/known-address mechanisms.
 * @param address Local IPv4 address
 * @param netmask Interface IPv4 netmask
 * @returns Usable IPv4 host addresses excluding the local address
 */
export const getAvailableAddresses = (address: string, netmask: string): string[] => {
  const addressInt = ipv4ToInt(address)
  const maskInt = ipv4ToInt(netmask)
  const networkInt = (addressInt & maskInt) >>> 0
  const broadcastInt = (networkInt | (~maskInt >>> 0)) >>> 0

  const hostCount = broadcastInt - networkInt - 1
  if (hostCount <= 0) return []

  if (hostCount > MAX_DISCOVERY_ADDRESSES) {
    console.warn(
      `Skipping automatic address expansion for ${address}/${netmask}: ${hostCount} usable hosts exceeds discovery limit ${MAX_DISCOVERY_ADDRESSES}`
    )
    return []
  }

  const addresses: string[] = []
  for (let current = networkInt + 1; current < broadcastInt; current += 1) {
    if (current !== addressInt) addresses.push(intToIpv4(current >>> 0))
  }
  return addresses
}

/**
 * Get the network information
 * @returns {NetworkInfo} The network information
 */
const getInfoOnSubnets = (): NetworkInfo[] => {
  const allSubnets = networkInterfaces()

  const ipv4Subnets = Object.entries(allSubnets)
    .flatMap(([interfaceName, nets]) => {
      return (nets ?? []).map((net) => ({ ...net, interfaceName }))
    })
    .filter((net) => net.family === 'IPv4')
    .filter((net) => !net.internal)

  if (ipv4Subnets.length === 0) {
    throw new Error('No network interfaces found.')
  }

  return ipv4Subnets.map((subnet) => ({
    topSideAddress: subnet.address,
    macAddress: subnet.mac,
    interfaceName: subnet.interfaceName,
    availableAddresses: getAvailableAddresses(subnet.address, subnet.netmask),
  }))
}

/**
 * Setup the network service
 */
export const setupNetworkService = (): void => {
  ipcMain.handle('get-info-on-subnets', getInfoOnSubnets)
}
