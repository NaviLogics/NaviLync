import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { getVersion } from '@/libs/non-browser-utils'

const packageVersion = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version as string

// Release 1.2.0: «О программе» shows the version of the build, also from a checkout without tags (CI)
describe('the version in «О программе»', () => {
  afterEach(() => {
    delete process.env.COCKPIT_VERSION
  })

  test('is the package.json version, linked to its NaviLync release', () => {
    const version = getVersion()
    expect(version.version).toBe(packageVersion)
    expect(version.link).toBe(`https://github.com/NaviLogics/NaviLync/releases/tag/v${packageVersion}`)
    expect(version.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('COCKPIT_VERSION still overrides it', () => {
    process.env.COCKPIT_VERSION = '1.2.0-test'
    expect(getVersion().version).toBe('1.2.0-test')
    expect(getVersion().link).toBe('https://github.com/NaviLogics/NaviLync/releases/tag/v1.2.0-test')
  })
})
