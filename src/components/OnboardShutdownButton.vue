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
    <p v-if="statusText" class="mt-1 text-xs text-right" :class="state === 'off' ? 'text-green-400' : 'text-amber-300'">
      {{ statusText }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { getStatus, requestOnboardPoweroff } from '@/libs/blueos'
import { SHUTDOWN_HOLD_MS, shutdownBlockedBy, waitUntilOffline } from '@/libs/vehicle/onboard-shutdown'
import { useMainVehicleStore } from '@/stores/mainVehicle'

const { t } = useI18n()
const vehicleStore = useMainVehicleStore()

const blockedBy = computed(() => shutdownBlockedBy(vehicleStore.isArmed, vehicleStore.velocity.ground))
const holding = ref(false)
const state = ref<'idle' | 'shuttingDown' | 'off' | 'timeout' | 'failed'>('idle')
const error = ref('')
const busy = computed(() => state.value === 'shuttingDown' || state.value === 'off')
let holdTimer: ReturnType<typeof setTimeout> | undefined

const statusText = computed(() => {
  if (state.value === 'shuttingDown') return t('onboardShutdown.shuttingDown')
  if (state.value === 'off') return t('onboardShutdown.canPowerOff')
  if (state.value === 'timeout') return t('onboardShutdown.timeout')
  if (state.value === 'failed') return t('onboardShutdown.failed', { error: error.value })
  return ''
})

const shutDown = async (): Promise<void> => {
  const address = vehicleStore.globalAddress
  state.value = 'shuttingDown'
  try {
    await requestOnboardPoweroff(address)
  } catch (failure) {
    error.value = String(failure)
    state.value = 'failed'
    return
  }
  // BlueOS powers off a few seconds after it answers: the main power may go off only once it stopped answering
  state.value = await waitUntilOffline(() => getStatus(address))
}

// Holding the button is the confirmation, so a stray click does not shut the computer down
const startHold = (): void => {
  if (blockedBy.value !== undefined || busy.value) return
  holding.value = true
  holdTimer = setTimeout(() => {
    holding.value = false
    holdTimer = undefined
    // A disabled button may never get the pointerup, so the conditions are checked again at the end of the hold
    if (blockedBy.value === undefined) shutDown()
  }, SHUTDOWN_HOLD_MS)
}

const cancelHold = (): void => {
  holding.value = false
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = undefined
}

onBeforeUnmount(cancelHold)
</script>
