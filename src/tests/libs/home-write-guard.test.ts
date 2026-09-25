import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, test } from 'vitest'

const rootDir = process.cwd()

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return listSourceFiles(path)
    return /\.(vue|ts)$/.test(entry) ? [path] : []
  })

// K1: rendering and view code must never change the vehicle HOME on its own. The only way to send
// MAV_CMD_DO_SET_HOME from the UI is the explicit, confirmed action in src/composables/setHomeAction.ts.
test('components and views never write HOME directly', () => {
  const offenders = ['src/components', 'src/views']
    .flatMap((dir) => listSourceFiles(join(rootDir, dir)))
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, location: `${relative(rootDir, file)}:${index + 1}` }))
        .filter(({ line }) => /\bsetHomeWaypoint\s*\(|MAV_CMD_DO_SET_HOME/.test(line))
        .map(({ line, location }) => `${location}: ${line.trim()}`)
    )

  expect(offenders).toEqual([])
})

test('HOME markers on the maps cannot be dragged to a new position', () => {
  const offenders = ['src/components/widgets/Map.vue', 'src/views/MissionPlanningView.vue'].filter((file) =>
    /homeMarker\.value\.on\(\s*'dragend'/.test(readFileSync(join(rootDir, file), 'utf8'))
  )

  expect(offenders).toEqual([])
})
