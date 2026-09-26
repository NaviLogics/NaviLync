<template>
  <div class="text-sm flex flex-wrap justify-start items-center gap-y-1 mt-1">
    <v-icon class="text-sm mr-4" :class="isHomeReported ? 'text-green-500' : 'text-red-500'">
      {{ isHomeReported ? 'mdi-check-circle' : 'mdi-close-circle' }}
    </v-icon>
    <p class="whitespace-nowrap mr-2">{{ t('missionPlanning.homePointChecklist') }}</p>
    <v-btn
      size="x-small"
      variant="tonal"
      min-width="0"
      class="ml-[30px] px-2 text-none tracking-normal text-[11px]"
      @click="emit('set-home')"
    >
      {{ t('missionPlanning.setHomeManually') }}
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMainVehicleStore } from '@/stores/mainVehicle'

const emit = defineEmits<{
  (event: 'set-home'): void
}>()

const { t } = useI18n()
const vehicleStore = useMainVehicleStore()

// Done once the vehicle reports a HOME, whether PX4 set it on its own or the operator set it by hand
const isHomeReported = computed(() => vehicleStore.homePosition !== undefined)
</script>
