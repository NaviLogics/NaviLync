import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { parsePingReply, pingHost } from '@/electron/services/network'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

/**
 * The error execFile passes when ping exits with a status other than 0 or cannot be started
 */
interface ExecFileError extends Error {
  /** The exit status, or the system error code such as ENOENT */
  code?: string | number
}
type ExecFileCallback = (error: ExecFileError | null, stdout: string, stderr: string) => void
const execFile = vi.fn()
vi.mock('child_process', () => ({ execFile: (...args: unknown[]) => execFile(...args) }))

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')

// Saved outputs of one ping; the Windows ones in the OEM code page the console writes in (CP866 on a Russian
// Windows, CP437 on an English one), read the way pingHost reads them
const sample = (name: string): string =>
  readFileSync(join(process.cwd(), 'src/tests/fixtures/ping', `${name}.txt`)).toString('latin1')

// Release 1.0, task 11: ping is the main sign the onboard computer went off
describe('reading the output of ping', () => {
  test.each([
    ['windows-ru-reply', true],
    ['windows-ru-timeout', false],
    ['windows-ru-unreachable', false],
    ['windows-en-reply', true],
    ['windows-en-timeout', false],
    ['windows-en-unreachable', false],
    ['linux-reply', true],
    ['linux-timeout', false],
    ['linux-unreachable', false],
  ])('%s → reply: %s', (name, reply) => {
    expect(parsePingReply(sample(name))).toBe(reply)
  })

  test('a router saying the host is unreachable, or that the TTL expired, is no reply', () => {
    expect(parsePingReply('Reply from 10.0.0.1: TTL expired in transit.')).toBe(false)
    expect(parsePingReply('Reply from 192.168.2.1: Destination host unreachable.')).toBe(false)
  })
})

describe('one ping from the main process', () => {
  // execFile answers as the system ping did: its exit status, what it printed, or no ping program at all
  const answer = (stdout: string, exitCode = 0, code?: string): void => {
    execFile.mockImplementation((_file: string, _args: string[], _options: unknown, callback: ExecFileCallback) => {
      if (code) return callback(Object.assign(new Error(`spawn ping ${code}`), { code }), '', '')
      callback(exitCode === 0 ? null : Object.assign(new Error('Command failed'), { code: exitCode }), stdout, '')
    })
  }

  beforeEach(() => {
    execFile.mockReset()
  })

  test('an echo reply is a reply', async () => {
    answer(sample('windows-ru-reply'))
    await expect(pingHost('192.168.2.2')).resolves.toBe('reply')
    expect(execFile.mock.calls[0][0]).toBe('ping')
    expect(execFile.mock.calls[0][1].at(-1)).toBe('192.168.2.2')
  })

  // Windows ping exits with 0 when a router answers «Заданный узел недоступен»: the exit status alone is not enough
  test('Windows: exit status 0 with «Заданный узел недоступен» is no reply', async () => {
    answer(sample('windows-ru-unreachable'))
    await expect(pingHost('192.168.2.2')).resolves.toBe('noReply')
  })

  test('Linux: no answer, ping exits with 1, is no reply', async () => {
    answer(sample('linux-timeout'), 1)
    await expect(pingHost('192.168.2.2')).resolves.toBe('noReply')
  })

  test('no ping program on the system: unavailable', async () => {
    answer('', 0, 'ENOENT')
    await expect(pingHost('192.168.2.2')).resolves.toBe('unavailable')
  })

  test('an address that is not a host name or IPv4 is not passed to ping', async () => {
    answer(sample('linux-reply'))
    await expect(pingHost('-c 100 192.168.2.2')).resolves.toBe('unavailable')
    await expect(pingHost('192.168.2.2 & calc')).resolves.toBe('unavailable')
    expect(execFile).not.toHaveBeenCalled()
  })

  test('the window reaches it over IPC', () => {
    expect(read('src/electron/services/network.ts')).toMatch(/ipcMain\.handle\('ping-host'/)
    expect(read('src/electron/preload.ts')).toMatch(
      /pingHost: \(address: string\) => ipcRenderer\.invoke\('ping-host', address\)/
    )
  })
})
