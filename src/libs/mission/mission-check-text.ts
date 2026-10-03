import type { Ref } from 'vue'

import type { MissionError, MissionWarning, VehicleMissionParameters } from '@/libs/mission/mission-validation'
import { i18n } from '@/plugins/i18n'

const currentLocale = (): string => (i18n.global.locale as unknown as Ref<string>).value

/**
 * A number as the mission check shows it
 * @param {number | undefined} value - The number; undefined for a speed the mission does not set
 * @returns {string} The number rounded to one decimal, with a decimal comma in Russian
 */
export const formatMissionCheckNumber = (value: number | undefined): string => {
  if (value === undefined) return i18n.global.t('missionCheck.speedUnset')
  const text = String(Math.round(value * 10) / 10)
  return currentLocale() === 'ru' ? text.replace('.', ',') : text
}

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
      return t('missionCheck.lastWaypointNotStopped', {
        speed: formatNumber(issue.speed),
        hold: formatNumber(issue.holdSeconds),
      })
    case 'legShorterThanAcceptance':
      return t('missionCheck.legShorterThanAcceptance', {
        marker: issue.marker,
        length: formatNumber(issue.legLength),
        radius: formatNumber(issue.radius),
      })
    case 'speedOverLimit':
      return t('missionCheck.speedOverLimit', { speed: formatNumber(issue.speed), limit: formatNumber(issue.limit) })
    case 'acceptanceRadiusWideForLines':
      return t('missionCheck.acceptanceRadiusWideForLines', {
        radius: formatNumber(issue.radius),
        spacing: formatNumber(issue.spacing),
      })
    case 'missionRunning':
      return ''
    case 'noWaypoints':
      return t('missionCheck.noWaypoints')
    case 'invalidSpeed':
      return t('missionCheck.invalidSpeed', { speed: formatNumber(issue.speed) })
    case 'invalidCoordinates':
      return t('missionCheck.invalidCoordinates', { marker: issue.marker })
  }
}

/**
 * The lines of the warning dialog shown before the upload
 * @param {MissionWarning[]} warnings - The mission check warnings
 * @param {VehicleMissionParameters} parameters - The vehicle parameters received so far
 * @returns {string[]} The lines; empty when there is nothing to ask the operator about. Missing parameters are
 * always reported: without them the speed check was not done
 */
export const missionCheckMessages = (warnings: MissionWarning[], parameters: VehicleMissionParameters): string[] => {
  const parametersKnown = parameters.speedLimit !== undefined && parameters.acceptanceRadius !== undefined
  return [
    ...warnings.map(missionCheckText),
    ...(parametersKnown ? [] : [i18n.global.t('missionCheck.parametersUnknown')]),
  ]
}
