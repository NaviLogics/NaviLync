<template>
  <div class="flex flex-col items-end">
    <v-btn
      class="onboard-shutdown"
      variant="outlined"
      size="small"
      :disabled="blockedBy !== undefined || busy"
      :title="blockedBy === undefined ? t('onboardShutdown.holdHint') : t(`onboardShutdown.${blockedBy}`)"
      @pointerdown="startHold"
      @pointerup="cancelHold"
      @pointerleave="cancelHold"
      @pointercancel="cancelHold"
    >
      {{ holding ? t('onboardShutdown.holdHint') : t('onboardShutdown.button') }}
    </v-btn>
    <p
      v-if="statusText"
      class="mt-1 text-xs text-right"
      :class="stage?.kind === 'off' ? 'text-green-400' : 'text-amber-300'"
    >
      {{ statusText }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useInteractionDialog } from '@/composables/interactionDialog'
import { openSnackbar } from '@/composables/snackbar'
import { getStatus, requestOnboardPoweroff } from '@/libs/blueos'
import {
  type OffDetection,
  type ShutdownStage,
  SHUTDOWN_HOLD_MS,
  shutdownBlockedBy,
  shutDownOnboardComputer,
} from '@/libs/vehicle/onboard-shutdown'
import { useMainVehicleStore } from '@/stores/mainVehicle'
import type { PingResult } from '@/types/network'

const { t } = useI18n()
const vehicleStore = useMainVehicleStore()
const { showDialog, closeDialog } = useInteractionDialog()

const blockedBy = computed(() => shutdownBlockedBy(vehicleStore.isArmed, vehicleStore.velocity.ground))
const holding = ref(false)
const running = ref(false)
const stage = ref<ShutdownStage | undefined>(undefined)
const busy = computed(() => running.value || stage.value?.kind === 'off')
let holdTimer: ReturnType<typeof setTimeout> | undefined

const statusText = computed(() => {
  switch (stage.value?.kind) {
    case 'shuttingDown':
      return stage.value.detection === 'ping'
        ? t('onboardShutdown.shuttingDown')
        : `${t('onboardShutdown.shuttingDown')} ${t('onboardShutdown.noPing')}`
    case 'finishing':
      return t('onboardShutdown.finishing', { seconds: stage.value.secondsLeft })
    case 'off':
      return t('onboardShutdown.canPowerOff')
    case 'timeout':
      return t('onboardShutdown.timeout')
    case 'failed':
      return t('onboardShutdown.failed', { error: stage.value.error })
    default:
      return ''
  }
})

const shutDown = async (): Promise<void> => {
  const address = vehicleStore.globalAddress
  // How the end is told, for the journal: the first stage after the command says it
  let detection: OffDetection | undefined
  const onStage = (next: ShutdownStage): void => {
    stage.value = next
    if (next.kind === 'shuttingDown') {
      detection = next.detection
      vehicleStore.logSessionEvent({ kind: 'onboardShutdown', stage: 'commandSent', detection })
    } else if (next.kind === 'off' || next.kind === 'timeout') {
      vehicleStore.logSessionEvent({ kind: 'onboardShutdown', stage: next.kind, detection })
    } else if (next.kind === 'failed') {
      vehicleStore.logSessionEvent({ kind: 'onboardShutdown', stage: 'failed', error: next.error })
    }
    // The outcome reaches the operator on any page, as the settings page may have been left meanwhile
    if (next.kind === 'off' || next.kind === 'timeout' || next.kind === 'failed') {
      const variant = next.kind === 'off' ? 'success' : next.kind === 'timeout' ? 'warning' : 'error'
      openSnackbar({ message: statusText.value, variant, duration: -1, closeButton: true })
    }
  }
  running.value = true
  stage.value = undefined
  try {
    await shutDownOnboardComputer({
      // Only the desktop app can ping; in the browser BlueOS /status tells instead
      ping: (): Promise<PingResult> => window.electronAPI?.pingHost?.(address) ?? Promise.resolve('unavailable'),
      status: () => getStatus(address),
      powerOff: () => requestOnboardPoweroff(address),
      onStage,
    })
  } finally {
    running.value = false
  }
}

const askToShutDown = (): void => {
  showDialog({
    variant: 'warning',
    title: t('onboardShutdown.button'),
    message: t('onboardShutdown.confirmText'),
    maxWidth: 500,
    actions: [
      { text: t('onboardShutdown.cancel'), action: () => closeDialog() },
      {
        text: t('onboardShutdown.confirm'),
        action: () => {
          closeDialog()
          // The vehicle may have been armed or moved while the dialog was open
          if (blockedBy.value === undefined && !busy.value) shutDown()
        },
      },
    ],
  })
}

// Holding the button, then the dialog, so a stray click does not shut the computer down
const startHold = (): void => {
  if (blockedBy.value !== undefined || busy.value) return
  holding.value = true
  holdTimer = setTimeout(() => {
    holding.value = false
    holdTimer = undefined
    // A disabled button may never get the pointerup, so the conditions are checked again at the end of the hold
    if (blockedBy.value === undefined) askToShutDown()
  }, SHUTDOWN_HOLD_MS)
}

const cancelHold = (): void => {
  holding.value = false
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = undefined
}

onBeforeUnmount(cancelHold)
</script>
