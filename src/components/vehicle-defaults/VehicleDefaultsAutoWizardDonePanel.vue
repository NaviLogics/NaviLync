<template>
  <div class="space-y-3 py-4 text-center text-sm opacity-80">
    <p>
      {{ t('vehicleDefaults.wizard.finished', { vehicle: evaluation?.vehicleTypeName }) }}
    </p>
    <p>
      {{ t('vehicleDefaults.wizard.laterInstructions') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useVehicleDefaultsAutoImportWizardInject } from '@/composables/vehicleDefaults/useVehicleDefaultsAutoImportWizard'

const { t } = useI18n()

const { evaluation } = useVehicleDefaultsAutoImportWizardInject()
</script>
