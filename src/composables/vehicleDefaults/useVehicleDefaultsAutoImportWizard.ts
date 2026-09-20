import { type InjectionKey, computed, inject, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAppInterfaceStore } from '@/stores/appInterface'

import { useVehicleDefaultsJoystickImport } from './useVehicleDefaultsJoystickImport'
import { useVehicleDefaultsViewsImport } from './useVehicleDefaultsViewsImport'
import { useVehicleDefaultsHandledFlag } from './vehicleDefaultsAutoImport'
import { useVehicleDefaultsEvaluation } from './vehicleDefaultsImportShared'

type AutoWizardStep = 'intro' | 'joystick' | 'views' | 'done'

/**
 * Auto-open vehicle defaults walkthrough: intro, joystick, views, done.
 * Confirmations (ignore all, finish walkthrough) live in the auto modal only.
 * @returns {VehicleDefaultsAutoImportWizard} Wizard state and handlers for the auto import modal
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const useVehicleDefaultsAutoImportWizard = () => {
  const { t } = useI18n()
  const interfaceStore = useAppInterfaceStore()
  const defaultsHandled = useVehicleDefaultsHandledFlag()
  const evaluationBundle = useVehicleDefaultsEvaluation()
  const viewsImport = useVehicleDefaultsViewsImport(evaluationBundle)
  const joystickImport = useVehicleDefaultsJoystickImport(evaluationBundle)

  const isVisible = computed({
    get: () => interfaceStore.isVehicleDefaultsAutoImportModalVisible,
    set: (v) => {
      interfaceStore.isVehicleDefaultsAutoImportModalVisible = v
    },
  })

  const autoWizardStep = ref<AutoWizardStep>('intro')
  const closeConfirmationVisible = ref(false)
  const ignoreConfirmationVisible = ref(false)

  const { evaluation } = evaluationBundle

  const hasAnyOffer = computed(() => viewsImport.hasImportOffer.value || joystickImport.hasImportOffer.value)

  const introParagraphs = computed((): string[] => {
    if (!evaluation.value) return []
    const vehicleTypeName = evaluation.value.vehicleTypeName
    return [
      t('vehicleDefaults.wizard.introDetection', { vehicle: vehicleTypeName }),
      t('vehicleDefaults.wizard.introOptions'),
      t('vehicleDefaults.wizard.introOnce'),
    ]
  })

  const stepNumbers: Record<AutoWizardStep, number> = { intro: 1, joystick: 2, views: 3, done: 4 }
  const stepTitles = computed<Record<AutoWizardStep, string>>(() => ({
    intro: t('vehicleDefaults.wizard.configuration'),
    joystick: t('vehicleDefaults.wizard.joystickTitle'),
    views: t('vehicleDefaults.wizard.viewsTitle'),
    done: t('vehicleDefaults.wizard.allSet'),
  }))

  const autoWizardStepNumber = computed(() => stepNumbers[autoWizardStep.value])
  const modalTitle = computed(() => stepTitles.value[autoWizardStep.value])

  const wizardSecondaryLabel = computed(() => {
    if (autoWizardStep.value === 'intro') return t('vehicleDefaults.wizard.ignore')
    if (autoWizardStep.value === 'joystick') {
      return joystickImport.hasImportOffer.value ? t('vehicleDefaults.wizard.ignoreJoystick') : ''
    }
    if (autoWizardStep.value === 'views') {
      return viewsImport.hasImportOffer.value ? t('vehicleDefaults.wizard.ignoreViews') : ''
    }
    return ''
  })

  const wizardPrimaryLabel = computed(() => {
    if (autoWizardStep.value === 'intro') return t('vehicleDefaults.wizard.next')
    if (autoWizardStep.value === 'joystick') {
      return joystickImport.hasImportOffer.value
        ? t('vehicleDefaults.wizard.importJoystick')
        : t('vehicleDefaults.wizard.next')
    }
    if (autoWizardStep.value === 'views') {
      return viewsImport.hasImportOffer.value
        ? t('vehicleDefaults.wizard.importViews')
        : t('vehicleDefaults.wizard.next')
    }
    return t('vehicleDefaults.wizard.done')
  })

  const wizardShowSecondaryButton = computed(() => {
    if (autoWizardStep.value === 'intro') return true
    if (autoWizardStep.value === 'joystick') return joystickImport.hasImportOffer.value
    if (autoWizardStep.value === 'views') return viewsImport.hasImportOffer.value
    return false
  })

  const wizardPrimaryDisabled = computed(() => {
    if (autoWizardStep.value === 'joystick' && joystickImport.hasImportOffer.value) {
      return joystickImport.selectedJoystickRowsCount.value === 0
    }
    if (autoWizardStep.value === 'views' && viewsImport.hasImportOffer.value) {
      return viewsImport.selectedDefaultViewNames.value.length === 0
    }
    return false
  })

  const resetWizard = (): void => {
    autoWizardStep.value = 'intro'
    viewsImport.refresh()
    joystickImport.refresh()
  }

  const finishAutoWizard = (): void => {
    defaultsHandled.value = true
    nextTick(() => {
      isVisible.value = false
    })
  }

  const onWizardIntroIgnore = (): void => {
    ignoreConfirmationVisible.value = true
  }

  const confirmIgnoreAll = (): void => {
    ignoreConfirmationVisible.value = false
    finishAutoWizard()
  }

  const cancelIgnoreAll = (): void => {
    ignoreConfirmationVisible.value = false
  }

  const onWizardPrimaryAction = (): void => {
    switch (autoWizardStep.value) {
      case 'intro':
        autoWizardStep.value = 'joystick'
        break
      case 'joystick':
        if (joystickImport.hasImportOffer.value) joystickImport.applyImport()
        autoWizardStep.value = 'views'
        break
      case 'views':
        if (!viewsImport.hasImportOffer.value) {
          autoWizardStep.value = 'done'
          break
        }
        if (viewsImport.viewsMode.value === 'replace' && !viewsImport.isCurrentViewsGroupBlank.value) {
          viewsImport.onClickImport()
          break
        }
        if (viewsImport.applyImport()) autoWizardStep.value = 'done'
        break
      case 'done':
        finishAutoWizard()
        break
    }
  }

  const onWizardSecondaryAction = (): void => {
    switch (autoWizardStep.value) {
      case 'intro':
        onWizardIntroIgnore()
        break
      case 'joystick':
        autoWizardStep.value = 'views'
        break
      case 'views':
        autoWizardStep.value = 'done'
        break
      case 'done':
        break
    }
  }

  const confirmViewsReplace = (): void => {
    if (!viewsImport.confirmReplace()) return
    if (autoWizardStep.value === 'views') autoWizardStep.value = 'done'
  }

  watch(isVisible, (visible, wasVisible) => {
    if (visible && !wasVisible) resetWizard()
    if (!visible) autoWizardStep.value = 'intro'
  })

  const requestCloseModal = (): void => {
    if (!hasAnyOffer.value || autoWizardStep.value === 'done') {
      if (autoWizardStep.value === 'done') finishAutoWizard()
      else isVisible.value = false
      return
    }
    closeConfirmationVisible.value = true
  }

  return {
    interfaceStore,
    isVisible,
    evaluation,
    introParagraphs,
    autoWizardStep,
    autoWizardStepNumber,
    modalTitle,
    hasAnyOffer,
    closeConfirmationVisible,
    ignoreConfirmationVisible,
    wizardSecondaryLabel,
    wizardPrimaryLabel,
    wizardShowSecondaryButton,
    wizardPrimaryDisabled,
    onWizardPrimaryAction,
    onWizardSecondaryAction,
    confirmIgnoreAll,
    cancelIgnoreAll,
    requestCloseModal,
    confirmViewsReplace,
    viewsImport,
    joystickImport,
  }
}

export type VehicleDefaultsAutoImportWizard = ReturnType<typeof useVehicleDefaultsAutoImportWizard>

export const vehicleDefaultsAutoImportWizardKey: InjectionKey<VehicleDefaultsAutoImportWizard> = Symbol(
  'vehicleDefaultsAutoImportWizard'
)

/**
 * Injects the auto defaults walkthrough state provided by the auto import modal.
 * @returns {VehicleDefaultsAutoImportWizard} Shared auto wizard state
 */
export const useVehicleDefaultsAutoImportWizardInject = (): VehicleDefaultsAutoImportWizard => {
  const context = inject(vehicleDefaultsAutoImportWizardKey)
  if (!context) {
    throw new Error('useVehicleDefaultsAutoImportWizardInject must be used within VehicleDefaultsAutoImportModal')
  }
  return context
}
