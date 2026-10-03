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

// Release 1.2.0: the hash of the archive itself, not of the GitHub download around it
describe('the SHA-256 of the Windows build', () => {
  const packaging = workflow.slice(
    workflow.indexOf('- name: Package Windows x64 directory'),
    workflow.indexOf('- name: Publish GitHub Release')
  )

  test('is computed for NaviLync-<version>-windows-x64.zip and printed in the log', () => {
    expect(packaging).toMatch(/Get-FileHash -Algorithm SHA256 \$archive/)
    expect(packaging).toMatch(/Write-Host "SHA-256 /)
    // Also as a notice on the run page, readable without the log
    expect(packaging).toMatch(/Write-Host "::notice title=SHA-256::\$name \$hash"/)
  })

  test('is written next to the ZIP as <name>.zip.sha256, and that file is in the artifact', () => {
    expect(packaging).toMatch(/"\$archive\.sha256"/)
    expect(packaging).toMatch(
      /path: \|\s*\n\s*dist\/NaviLync-\*-windows-x64\.zip\s*\n\s*dist\/NaviLync-\*-windows-x64\.zip\.sha256/
    )
  })
})

// The store tests import the whole store in beforeAll: on a cold container that took over the 10 s default twice
describe('test hooks', () => {
  test('may take up to 30 s', () => {
    const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8')
    expect(config).toMatch(/hookTimeout: 30_?000/)
  })
})
