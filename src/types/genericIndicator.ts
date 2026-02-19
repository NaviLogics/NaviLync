/**
 * Variables that define generic indicator
 */
export interface VeryGenericIndicatorPreset {
  /**
   * Name to be displayed on the widget
   */
  displayName: string
  /**
   * Name of the variable to be fetched
   */
  variableName: string
  /**
   * Name of the icon to be used (only supporting MDI icons currently)
   */
  iconName: string
  /**
   * Symbols representing the unit system of the variable
   */
  variableUnit: string
  /**
   * Value that multiplies the original value to bring it to a representative unit system
   */
  variableMultiplier: number
}

import { i18n } from '@/plugins/i18n'

export const veryGenericIndicatorPresets: VeryGenericIndicatorPreset[] = [
  {
    get displayName() {
      return i18n.global.t('genericIndicatorPresets.camTilt')
    },
    variableName: 'CamTilt',
    iconName: 'mdi-camera-retake',
    variableUnit: '%',
    variableMultiplier: 100,
  },
  {
    get displayName() {
      return i18n.global.t('genericIndicatorPresets.camPan')
    },
    variableName: 'CamPan',
    iconName: 'mdi-camera-retake',
    variableUnit: '%',
    variableMultiplier: 100,
  },
  {
    get displayName() {
      return i18n.global.t('genericIndicatorPresets.waterTemp')
    },
    variableName: 'SCALED_PRESSURE2.temperature',
    iconName: 'mdi-thermometer',
    variableUnit: '°C',
    variableMultiplier: 0.01,
  },
  {
    get displayName() {
      return i18n.global.t('genericIndicatorPresets.tetherTurns')
    },
    variableName: 'TetherTrn',
    iconName: 'mdi-horizontal-rotate-clockwise',
    variableUnit: 'x',
    variableMultiplier: 1,
  },
  {
    get displayName() {
      return i18n.global.t('genericIndicatorPresets.lights1')
    },
    variableName: 'Lights1',
    iconName: 'mdi-flashlight',
    variableUnit: '%',
    variableMultiplier: 100,
  },
  {
    get displayName() {
      return i18n.global.t('genericIndicatorPresets.lights2')
    },
    variableName: 'Lights2',
    iconName: 'mdi-flashlight',
    variableUnit: '%',
    variableMultiplier: 100,
  },
  {
    get displayName() {
      return i18n.global.t('genericIndicatorPresets.pilotGain')
    },
    variableName: 'PilotGain',
    iconName: 'mdi-account-hard-hat',
    variableUnit: '%',
    variableMultiplier: 100,
  },
  {
    get displayName() {
      return i18n.global.t('genericIndicatorPresets.inputHold')
    },
    variableName: 'InputHold',
    iconName: 'mdi-gesture-tap-hold',
    variableUnit: '',
    variableMultiplier: 1,
  },
  {
    get displayName() {
      return i18n.global.t('genericIndicatorPresets.rollPitch')
    },
    variableName: 'RollPitch',
    iconName: 'mdi-controller',
    variableUnit: '',
    variableMultiplier: 1,
  },
  {
    get displayName() {
      return i18n.global.t('genericIndicatorPresets.altitude')
    },
    variableName: 'RANGEFINDER/distance',
    iconName: 'mdi-arrow-collapse-down',
    variableUnit: 'm',
    variableMultiplier: 1,
  },
]
