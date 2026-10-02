<template>
  <v-btn
    class="autopilot-reboot"
    variant="outlined"
    size="small"
    :disabled="!isAutopilotRebootAllowed(vehicleStore.isArmed)"
    :title="isAutopilotRebootAllowed(vehicleStore.isArmed) ? undefined : t('autopilotReboot.onlyDisarmed')"
    @click="askToReboot"
  >
    {{ t('autopilotReboot.button') }}
  </v-btn>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useInteractionDialog } from '@/composables/interactionDialog'
import { isAutopilotRebootAllowed } from '@/libs/vehicle/autopilot-reboot'
import { useMainVehicleStore } from '@/stores/mainVehicle'

const { t } = useI18n()
const vehicleStore = useMainVehicleStore()
const { showDialog, closeDialog } = useInteractionDialog()

// After a software reboot the Pixhawk hung until its power was removed, so the operator is warned first
const askToReboot = (): void => {
  showDialog({
    variant: 'warning',
    title: t('autopilotReboot.title'),
    message: t('autopilotReboot.warning'),
    maxWidth: 500,
    actions: [
      { text: t('autopilotReboot.cancel'), action: () => closeDialog() },
      {
        text: t('autopilotReboot.confirm'),
        action: async () => {
          closeDialog()
          try {
            await vehicleStore.rebootAutopilot()
          } catch (error) {
            showDialog({ variant: 'error', message: t('autopilotReboot.failed', { error: String(error) }) })
          }
        },
      },
    ],
  })
}
</script>
