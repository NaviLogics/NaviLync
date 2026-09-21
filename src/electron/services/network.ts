import { execFile } from 'child_process'
import { ipcMain } from 'electron'
import { networkInterfaces } from 'os'
import { promisify } from 'util'

import { NetworkInfo } from '../../types/network'

/**
 * Interface name prefixes that are virtual / non-physical and should be skipped
 * during vehicle discovery: VPN tunnels, container/VM bridges, Apple wireless
 * peer-to-peer interfaces, IPSec, etc. None of these can carry a BlueOS vehicle.
 */
const VIRTUAL_INTERFACE_PREFIXES = [
  'awdl', // Apple Wireless Direct Link
  'br-', // Docker user-defined bridge
  'bridge', // macOS bridge
  'docker', // Docker default bridge
  'feth', // macOS fake ethernet (Docker / virtualization)
  'gif', // macOS generic tunnel
  'ipsec', // IPSec tunnel
  'llw', // Apple low-latency wifi
  'lo', // loopback (also caught by `internal`, but keep explicit)
  'stf', // macOS 6to4 tunnel
  'tap', // generic TAP device
  'tun', // generic TUN device
  'utun', // macOS userland tunnel (VPN)
  'vboxnet', // VirtualBox host-only
  'veth', // Linux virtual ethernet pair
  'vmnet', // VMware host-only / NAT
  'wg', // WireGuard
  'zt', // ZeroTier
]

const isVirtualInterface = (interfaceName: string): boolean => {
  const lower = interfaceName.toLowerCase()
  return VIRTUAL_INTERFACE_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

const MAX_DISCOVERY_ADDRESSES = 4094
const execFileAsync = promisify(execFile)

export interface HostReachability {
  reachable: boolean
  latencyMs?: number
}

const isValidIpv4 = (address: string): boolean => {
  const octets = address.split('.').map((part) => Number(part))
  return octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
}

export const parsePingLatencyMs = (output: string): number | undefined => {
  const directMatch = output.match(/time[=<]\s*(\d+(?:[.,]\d+)?)\s*ms/i)
  if (directMatch) return Number(directMatch[1].replace(',', '.'))

  const windowsAverageMatch = output.match(/Average\s*=\s*(\d+)ms/i)
  if (windowsAverageMatch) return Number(windowsAverageMatch[1])

  return undefined
}

export const checkHostReachability = async (address: string): Promise<HostReachability> => {
  if (!isValidIpv4(address)) throw new Error(`Invalid IPv4 address: ${address}`)

  const args =
    process.platform === 'win32'
      ? ['-n', '1', '-w', '1000', address]
      : process.platform === 'darwin'
      ? ['-c', '1', '-W', '1000', address]
      : ['-c', '1', '-W', '1', address]

  const startedAt = performance.now()
  try {
    const { stdout } = await execFileAsync('ping', args, { windowsHide: true, timeout: 2000 })
    return {
      reachable: true,
      latencyMs: parsePingLatencyMs(stdout) ?? Math.max(0, performance.now() - startedAt),
    }
  } catch {
    return { reachable: false }
  }
}

const ipv4ToInt = (address: string): number => {
  const octets = address.split('.').map((part) => Number(part))
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    throw new Error(`Invalid IPv4 address: ${address}`)
  }
  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0
}

const intToIpv4 = (value: number): string =>
  [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join('.')

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

  const rawList = Object.entries(allSubnets).flatMap(([_, nets]) => {
    return (nets ?? []).map((net) => ({ ...net, interfaceName: _ }))
  })
  console.log(
    `[VehicleDiscovery] Raw network interfaces: ${JSON.stringify(
      rawList.map((n) => ({
        iface: n.interfaceName,
        family: n.family,
        internal: n.internal,
        addr: n.address,
        cidr: n.cidr,
      }))
    )}`
  )

  const ipv4Candidates = rawList.filter((net) => net.family === 'IPv4').filter((net) => !net.internal)

  const skipped = ipv4Candidates.filter((net) => isVirtualInterface(net.interfaceName))
  const ipv4Subnets = ipv4Candidates.filter((net) => !isVirtualInterface(net.interfaceName))

  if (skipped.length > 0) {
    console.log(
      `[VehicleDiscovery] Skipping ${skipped.length} virtual interface(s): ${JSON.stringify(
        skipped.map((n) => ({ iface: n.interfaceName, addr: n.address }))
      )}`
    )
  }

  if (ipv4Subnets.length === 0) {
    console.warn('[VehicleDiscovery] No external IPv4 interfaces found, aborting.')
    throw new Error('No network interfaces found.')
  }

  const result = ipv4Subnets.map((subnet) => ({
    topSideAddress: subnet.address,
    macAddress: subnet.mac,
    interfaceName: subnet.interfaceName,
    availableAddresses: getAvailableAddresses(subnet.address, subnet.netmask),
  }))

  console.log(
    `[VehicleDiscovery] Subnets to scan: ${JSON.stringify(
      result.map((s) => ({ iface: s.interfaceName, top: s.topSideAddress, count: s.availableAddresses.length }))
    )}`
  )

  return result
}

/**
 * Setup the network service
 */
export const setupNetworkService = (): void => {
  ipcMain.handle('get-info-on-subnets', getInfoOnSubnets)
  ipcMain.handle('check-host-reachability', (_event, address: string) => checkHostReachability(address))
}
