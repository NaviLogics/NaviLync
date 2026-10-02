import type { MissionError, MissionWarning, VehicleMissionParameters } from '@/libs/mission/mission-validation'
import { i18n } from '@/plugins/i18n'

/**
 * A number as the mission check shows it
 * @param {number | undefined} value - The number; undefined for a speed the mission does not set
 * @returns {string} The number rounded to one decimal
 */
export const formatMissionCheckNumber = (value: number | undefined): string =>
  value === undefined ? i18n.global.t('missionCheck.speedUnset') : String(Math.round(value * 10) / 10)

/**
 * The text of one mission check issue
 * @param {MissionWarning | MissionError} issue - The issue
 * @returns {string} What the operator reads
 */
export const missionCheckText = (issue: MissionWarning | MissionError): string => {
  const { t } = i18n.global
  const formatNumber = formatMissionCheckNumber
  switch (issue.kind) {
    case 'lastWaypointNotStopped':
      return t('missionCheck.lastWaypointNotStopped', { speed: formatNumber(issue.speed), hold: issue.holdSeconds })
    case 'legShorterThanAcceptance':
      return t('missionCheck.legShorterThanAcceptance', {
        marker: issue.marker,
        length: formatNumber(issue.legLength),
        radius: formatNumber(issue.radius),
      })
    case 'speedOverLimit':
      return t('missionCheck.speedOverLimit', { speed: formatNumber(issue.speed), limit: formatNumber(issue.limit) })
    case 'turnRadiusOverHalfSpacing':
      return t('missionCheck.turnRadiusOverHalfSpacing', {
        marker: issue.marker,
        radius: formatNumber(issue.radius),
        spacing: formatNumber(issue.spacing),
      })
    case 'noWaypoints':
      return t('missionCheck.noWaypoints')
    case 'invalidSpeed':
      return t('missionCheck.invalidSpeed', { speed: issue.speed })
    case 'invalidCoordinates':
      return t('missionCheck.invalidCoordinates', { marker: issue.marker })
  }
}

/**
 * The lines of the warning dialog shown before the upload
 * @param {MissionWarning[]} warnings - The mission check warnings
 * @param {VehicleMissionParameters} parameters - The vehicle parameters received so far
 * @returns {string[]} The lines; empty when there is nothing to ask the operator about
 */
export const missionCheckMessages = (warnings: MissionWarning[], parameters: VehicleMissionParameters): string[] => {
  const parametersKnown = parameters.speedLimit !== undefined && parameters.acceptanceRadius !== undefined
  if (warnings.length === 0) return []
  return [
    ...warnings.map(missionCheckText),
    ...(parametersKnown ? [] : [i18n.global.t('missionCheck.parametersUnknown')]),
  ]
}
