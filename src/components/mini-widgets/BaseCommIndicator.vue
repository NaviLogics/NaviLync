<template>
  <v-menu location="bottom" :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <v-tooltip :text="stateText" location="top">
        <template #activator="{ props: tooltipProps }">
          <div
            class="relative cursor-pointer"
            :class="`link-${store.linkHealthState}`"
            v-bind="{ ...tooltipProps, ...menuProps }"
          >
            <FontAwesomeIcon icon="fa-solid fa-arrow-right-arrow-left" size="xl" />
            <FontAwesomeIcon v-if="!store.isVehicleOnline" icon="fa-slash" size="xl" class="absolute -left-1" />
          </div>
        </template>
      </v-tooltip>
    </template>
    <div class="link-journal p-3 rounded-md text-white text-sm bg-[#1b2a35ee] min-w-[260px]">
      <p class="font-semibold mb-2">{{ t('linkHealth.journalTitle') }}</p>
      <p v-if="store.linkOutages.length === 0" class="opacity-70">{{ t('linkHealth.noOutages') }}</p>
      <div
        v-for="outage in [...store.linkOutages].reverse()"
        :key="outage.startedAt"
        class="link-outage flex gap-x-3 py-[2px]"
      >
        <span class="font-mono">{{ format(outage.startedAt, 'HH:mm:ss') }}</span>
        <span class="font-mono">
          {{ t('linkHealth.duration', { seconds: Math.round(outage.durationMs / 1000) }) }}
          <template v-if="!outage.ended"> ({{ t('linkHealth.ongoing') }})</template>
        </span>
        <span>{{ outage.context.mode ?? '—' }}</span>
        <span>{{ armingText(outage.context.armed) }}</span>
      </div>
    </div>
  </v-menu>
</template>

<script setup lang="ts">
import { format } from 'date-fns'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMainVehicleStore } from '@/stores/mainVehicle'

const { t } = useI18n()
const store = useMainVehicleStore()

// Green under 2 s since the last autopilot HEARTBEAT, yellow from 2 to 5 s, red over 5 s (COM_DL_LOSS_T)
const stateText = computed((): string => {
  const age = ((store.heartbeatAgeMs ?? 0) / 1000).toFixed(1)
  return t(`linkHealth.${store.linkHealthState}`, { age })
})

const armingText = (armed: boolean | undefined): string =>
  armed === undefined ? t('linkHealth.unknownArming') : armed ? t('linkHealth.armed') : t('linkHealth.disarmed')
</script>

<style scoped>
.link-ok {
  color: #4ade80;
}
.link-degraded {
  color: #facc15;
}
.link-lost {
  color: #f87171;
}
.link-none {
  color: #374151;
}
</style>
