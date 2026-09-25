#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-env node */
/**
 * Typecheck gate that tolerates the known, pre-existing vue-tsc errors and fails on any new one.
 *
 * vue-tsc is run with the same arguments CI used before. Each diagnostic is normalized to
 * `file(line,column) TSxxxx` and compared, as a multiset, against docs/navilync/typecheck-baseline.txt.
 *
 * The gate fails when:
 *   - an error is reported that is not in the baseline;
 *   - vue-tsc prints a Volar crash marker (`languageId not found`, `!!sourceScript`). vue-tsc 2.0.10 with
 *     `@volar/typescript` >= 2.2.0-alpha.11 crashed this way and exited 0 without checking anything;
 *   - vue-tsc exits abnormally, or its exit code disagrees with the diagnostics it printed.
 *
 * Baseline entries that no longer occur are reported but do not fail the gate.
 *
 * Usage:
 *   node scripts/typecheck-baseline.mjs           Check against the baseline
 *   node scripts/typecheck-baseline.mjs --update  Rewrite the baseline from the current errors
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const baselinePath = join(rootDir, 'docs', 'navilync', 'typecheck-baseline.txt')
const vueTscBin = join(rootDir, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js')
const vueTscArgs = ['--noEmit', '-p', 'tsconfig.vitest.json', '--composite', 'false']
const crashMarkers = ['languageId not found', '!!sourceScript']
const diagnosticPattern = /^(.+?)\((\d+),(\d+)\): error (TS\d+): /
const baselineHeader = [
  '# Known vue-tsc errors tolerated by scripts/typecheck-baseline.mjs.',
  '# Regenerate with: yarn typecheck:update-baseline',
]

/**
 * Normalize a path printed by vue-tsc to a forward-slash path relative to the repository root.
 * @param {string} file - Path as printed by vue-tsc, relative or absolute
 * @returns {string} Repository-relative path, e.g. `src/stores/mainVehicle.ts`
 */
const normalizePath = (file) => {
  const unixPath = file.replace(/\\/g, '/')
  const absoluteRoot = rootDir.replace(/\\/g, '/')
  return unixPath.startsWith(`${absoluteRoot}/`) ? relative(rootDir, file).replace(/\\/g, '/') : unixPath
}

/**
 * Split vue-tsc output into diagnostics, keeping continuation lines with the error they belong to.
 * @param {string} output - Combined stdout and stderr of vue-tsc
 * @returns {{ key: string, text: string }[]} One entry per error, e.g. `{ key: 'src/a.ts(1,7) TS2322', text: ... }`
 */
const parseDiagnostics = (output) => {
  const diagnostics = []
  for (const line of output.split(/\r?\n/)) {
    const match = diagnosticPattern.exec(line)
    if (match) {
      const [, file, lineNumber, column, code] = match
      diagnostics.push({ key: `${normalizePath(file)}(${lineNumber},${column}) ${code}`, text: line })
    } else if (diagnostics.length > 0 && /^\s/.test(line)) {
      diagnostics[diagnostics.length - 1].text += `\n${line}`
    }
  }
  return diagnostics
}

/**
 * Order baseline keys by file, then line, then column, so the baseline diffs cleanly.
 * @param {string} a - First key
 * @param {string} b - Second key
 * @returns {number} Negative, zero or positive, as expected by Array.prototype.sort
 */
const compareKeys = (a, b) => {
  const [, fileA, lineA, columnA, codeA] = /^(.+)\((\d+),(\d+)\) (TS\d+)$/.exec(a) ?? []
  const [, fileB, lineB, columnB, codeB] = /^(.+)\((\d+),(\d+)\) (TS\d+)$/.exec(b) ?? []
  if (fileA !== fileB) return fileA < fileB ? -1 : 1
  if (lineA !== lineB) return Number(lineA) - Number(lineB)
  if (columnA !== columnB) return Number(columnA) - Number(columnB)
  return codeA < codeB ? -1 : codeA > codeB ? 1 : 0
}

/**
 * Count occurrences of each key.
 * @param {string[]} keys - Normalized diagnostic keys
 * @returns {Map<string, number>} Occurrences per key
 */
const countKeys = (keys) => {
  const counts = new Map()
  keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1))
  return counts
}

/**
 * Read the baseline file, ignoring comments and blank lines.
 * @returns {string[]} Baseline keys, an empty list if the file does not exist
 */
const readBaseline = () => {
  if (!existsSync(baselinePath)) return []
  return readFileSync(baselinePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
}

/**
 * Run the gate and exit the process with its result.
 * @returns {void}
 */
const main = () => {
  const update = process.argv.includes('--update')
  const result = spawnSync(process.execPath, [vueTscBin, ...vueTscArgs], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.error) {
    console.error(`Could not run vue-tsc: ${result.error.message}`)
    process.exit(1)
  }

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const diagnostics = parseDiagnostics(output)
  const failures = []

  const crashMarker = crashMarkers.find((marker) => output.includes(marker))
  if (crashMarker) {
    failures.push(`vue-tsc crashed ("${crashMarker}") and did not typecheck the project.`)
  }
  const globalErrors = output.split(/\r?\n/).filter((line) => /^error TS\d+: /.test(line))
  if (globalErrors.length > 0) {
    failures.push(`vue-tsc reported errors without a file position:\n${globalErrors.join('\n')}`)
  }
  if (result.signal || ![0, 1, 2].includes(result.status)) {
    failures.push(`vue-tsc exited abnormally (status ${result.status}, signal ${result.signal}).`)
  } else if ((result.status === 0) !== (diagnostics.length === 0)) {
    failures.push(`vue-tsc exited with status ${result.status} but printed ${diagnostics.length} errors.`)
  }

  if (failures.length > 0) {
    console.error(output)
    failures.forEach((failure) => console.error(`ERROR: ${failure}`))
    process.exit(1)
  }

  const currentKeys = diagnostics.map(({ key }) => key)

  if (update) {
    const sorted = [...currentKeys].sort(compareKeys)
    writeFileSync(baselinePath, [...baselineHeader, ...sorted, ''].join('\n'))
    console.log(`Wrote ${sorted.length} errors to ${relative(rootDir, baselinePath)}.`)
    return
  }

  const baselineCounts = countKeys(readBaseline())
  const remainingBaseline = new Map(baselineCounts)
  const newDiagnostics = diagnostics.filter(({ key }) => {
    const remaining = remainingBaseline.get(key) ?? 0
    if (remaining === 0) return true
    remainingBaseline.set(key, remaining - 1)
    return false
  })
  const resolvedKeys = [...remainingBaseline.entries()].flatMap(([key, count]) => Array(count).fill(key))
  const baselineSize = [...baselineCounts.values()].reduce((total, count) => total + count, 0)

  console.log(
    `vue-tsc: ${diagnostics.length} errors, ${baselineSize} in baseline, ${newDiagnostics.length} new, ` +
      `${resolvedKeys.length} baseline entries no longer reported.`
  )

  if (resolvedKeys.length > 0) {
    console.log('\nBaseline entries no longer reported (run `yarn typecheck:update-baseline` to drop them):')
    resolvedKeys.sort(compareKeys).forEach((key) => console.log(`  ${key}`))
  }

  if (newDiagnostics.length > 0) {
    console.error('\nNew typecheck errors not present in the baseline:')
    newDiagnostics.forEach(({ text }) => console.error(text))
    process.exit(1)
  }
}

main()
