import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// Map.vue cannot be mounted under vitest (Leaflet needs a real browser), so these read its source, like
// home-write-guard.test.ts does for HOME.
const mapSource = readFileSync(join(process.cwd(), 'src/components/widgets/Map.vue'), 'utf8')

const functionBody = (name: string): string => {
  const start = mapSource.indexOf(`const ${name} = async`)
  expect(start).toBeGreaterThan(-1)
  return mapSource.slice(start, mapSource.indexOf('\n}\n', start))
}

// The flight map refreshes the vehicle mission on its own (P6: useMissionRefreshWhenIdle). That refresh must only
// redraw the map, never touch the mission being planned or its draft in the planner.
test('the flight map never writes the planned mission or its draft', () => {
  const writes = mapSource
    .split('\n')
    .filter((line) =>
      /missionStore\.(currentPlanningWaypoints|clearMission\(|clearDraft\(|draftMission|bumpVehicleMissionRevision\()/.test(
        line
      )
    )

  expect(writes).toEqual([])
})

// A refresh the operator did not ask for must not stop them with a modal dialog, e.g. on every link flap
test('a failed mission download on the flight map is reported in a snackbar, not a modal dialog', () => {
  const download = functionBody('downloadMissionFromVehicle')

  expect(download).not.toContain('showDialog(')
  expect(download).toMatch(/catch \(error\) \{\s*openSnackbar\(\{\s*variant: 'error'/)
})
