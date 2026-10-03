import { execSync } from 'child_process'

import packageJson from '../../package.json'
import type { AppVersionInfo } from './cosmos'

/**
 * The GitHub link for a version: its release, or the pull request of a PR build (e.g. "0.0.0-1234")
 * @param {string} version - The version string
 * @param {string} repoUrl - The base repository URL
 * @returns {string} The GitHub link for the version
 */
function getVersionLink(version: string, repoUrl: string): string {
  const prMatch = version.match(/^0\.0\.0-(\d+)$/)
  if (prMatch) {
    return `${repoUrl}/pull/${prMatch[1]}`
  }
  return `${repoUrl}/releases/tag/v${version}`
}

/**
 * Returns the version information of the application: the package.json version (the one of the NaviLync build),
 * unless the COCKPIT_VERSION env var sets another one, with the date of the last commit
 * @returns {AppVersionInfo}
 */
export function getVersion(): AppVersionInfo {
  const repoUrl = 'https://github.com/NaviLogics/NaviLync'
  // The latest git tag is not the build version, and a CI checkout has no tags at all
  const version = process.env.COCKPIT_VERSION || packageJson.version
  const date = (() => {
    try {
      return execSync('git show -s --format=%ai HEAD', { encoding: 'utf8' }).trim().split(' ')[0]
    } catch {
      return new Date().toISOString().split('T')[0]
    }
  })()
  return { version, date, link: getVersionLink(version, repoUrl) }
}
