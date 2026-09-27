#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-env node */
/**
 * Checks that a built Windows exe carries the application icon, and no Cockpit name in its version information.
 *
 * The taskbar, Explorer and pinned shortcuts take the icon from the exe resources, which electron-builder writes
 * from `build.win.icon`. The check compares the images of the exe's icon group with the images of the .ico file,
 * and prints the version strings (ProductName, FileDescription, ...) of the exe to the build log.
 *
 * Usage:
 *   node scripts/check-windows-exe-icon.mjs dist/win-unpacked/NaviLync.exe public/navilync.ico
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as ResEdit from 'resedit'

const [exePath, icoPath] = process.argv.slice(2)
if (!exePath || !icoPath) {
  console.error('Usage: node scripts/check-windows-exe-icon.mjs <exe> <ico>')
  process.exit(2)
}

const hash = (item) => {
  const bytes = item.isRaw() ? item.bin : item.generate()
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}
const sorted = (hashes) => [...hashes].sort()

const exe = ResEdit.NtExecutable.from(readFileSync(exePath), { ignoreCert: true })
const resources = ResEdit.NtExecutableResource.from(exe)
const icoImages = sorted(ResEdit.Data.IconFile.from(readFileSync(icoPath)).icons.map((icon) => hash(icon.data)))

const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries)
const exeGroupImages = groups.map((group) => sorted(group.getIconItemsFromEntries(resources.entries).map(hash)))
console.log(`${icoPath}: ${icoImages.length} images`)
groups.forEach((group, index) =>
  console.log(`${exePath} icon group ${group.id}: ${exeGroupImages[index].length} images`)
)

const versionStrings = ResEdit.Resource.VersionInfo.fromEntries(resources.entries).flatMap((info) =>
  info.getAllLanguagesForStringValues().map((language) => info.getStringValues(language))
)
versionStrings.forEach((strings) => console.log(`${exePath} version strings: ${JSON.stringify(strings)}`))

const errors = []
// Windows shows the first icon group of the exe
if (exeGroupImages.length === 0 || exeGroupImages[0].join() !== icoImages.join()) {
  errors.push(`the icon of ${exePath} is not ${icoPath}`)
}
if (versionStrings.some((strings) => Object.values(strings).some((value) => /cockpit/i.test(value)))) {
  errors.push(`the version information of ${exePath} names Cockpit`)
}

if (errors.length > 0) {
  errors.forEach((error) => console.error(`Error: ${error}.`))
  process.exit(1)
}
console.log(`OK: ${exePath} carries the icon of ${icoPath}.`)
