import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const workflow = readFileSync(join(process.cwd(), '.github/workflows/navilync-windows.yml'), 'utf8')
const publish = workflow.slice(workflow.indexOf('- name: Publish GitHub Release'))

// Release 1.2.0: a release candidate published through its tag must not become the latest release
describe('publishing a NaviLync release', () => {
  test('versions with -rc, -beta or -alpha are published as a pre-release', () => {
    expect(publish).toMatch(/\$prerelease = \$version -match '-\(rc\|beta\|alpha\)'/)
    expect(publish).toMatch(/if \(\$prerelease\) \{[^}]*'--prerelease'/)
    expect(publish).toMatch(/gh release create \$tag \$asset @createFlags/)
  })

  test('the PowerShell pattern matches the pre-release versions only', () => {
    // The same pattern, as PowerShell -match applies it (case-insensitive)
    const prerelease = (version: string): boolean => /-(rc|beta|alpha)/i.test(version)
    expect(['1.2.0-rc.1', '1.2.0-beta.2', '1.3.0-alpha', '1.2.0-RC1'].map(prerelease)).toEqual([true, true, true, true])
    expect(['1.2.0', '1.1.2', '2.0.0'].map(prerelease)).toEqual([false, false, false])
  })
})
