<template>
  <div
    v-if="modelValue"
    class="absolute right-4 bottom-36 rounded-[10px] px-3 py-2"
    :style="[interfaceStore.globalGlassMenuStyles, { width: '250px' }]"
  >
    <p class="text-sm font-semibold mb-[6px]">{{ $t('missionEstimates.title') }}</p>
    <v-divider class="mb-2" />
    <v-icon
      v-if="isOptionsIconVisible"
      icon="mdi-cog"
      class="absolute top-[10px] right-[10px] cursor-pointer opacity-80"
      size="14"
      @click="openSettings"
    />
    <div class="text-xs leading-6">
      <div class="flex justify-between">
        <span>{{ $t('missionEstimates.length') }}</span
        ><span>{{ totalMissionLength }}</span>
      </div>
      <div class="flex justify-between">
        <span>{{ $t('missionEstimates.eta') }}</span
        ><span>{{ missionDuration }}</span>
      </div>
      <div class="flex justify-between">
        <span>{{ $t('missionEstimates.energy') }}</span
        ><span>{{ missionEnergy }}</span>
      </div>
      <div v-if="totalSurveyCoverage !== '—'" class="flex justify-between">
        <span>{{ $t('missionEstimates.totalSurveyCoverage') }}</span
        ><span>{{ totalSurveyCoverage }}</span>
      </div>
      <div v-if="missionCoverage !== '—'" class="flex justify-between">
        <span>{{ $t('missionEstimates.missionArea') }}</span
        ><span>{{ missionCoverage }}</span>
      </div>
    </div>
  </div>
  <v-dialog v-model="isSettingsOpen" persistent max-width="500px">
    <v-card :style="interfaceStore.globalGlassMenuStyles">
      <v-card-title class="text-lg text-center font-semibold">{{ $t('missionEstimates.settingsTitle') }}</v-card-title>
      <v-icon icon="mdi-close" class="absolute top-3 right-3" @click="isSettingsOpen = false" />
      <v-card-text>
        <div class="mb-6">
          <label class="block text-sm font-medium mb-1">{{ $t('missionEstimates.extraPayload') }}</label>
          <v-text-field
            v-model="vehicleStore.vehiclePayloadParameters.extraPayloadKg"
            theme="dark"
            type="number"
            min="0"
            step="0.1"
            density="compact"
            hide-details
            class="w-full border"
          />
          <p class="text-[11px] opacity-70 mt-1">{{ $t('missionEstimates.extraPayloadHint') }}</p>
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium mb-1">{{ $t('missionEstimates.batteryType') }}</label>
          <v-select
            v-model="vehicleStore.vehiclePayloadParameters.batteryChemistry"
            theme="dark"
            :items="batteryChemistryItems"
            item-title="title"
            item-value="value"
            density="compact"
            hide-details
            class="w-full border"
          />
          <p class="text-[11px] opacity-70 mt-1">{{ $t('missionEstimates.batteryTypeHint') }}</p>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1">{{ $t('missionEstimates.batteryCapacity') }}</label>
          <v-text-field
            v-model="vehicleStore.vehiclePayloadParameters.batteryCapacity"
            theme="dark"
            type="number"
            min="2"
            step="0.1"
            density="compact"
            hide-details
            class="w-full border"
          />
          <p class="text-[11px] opacity-70 mt-1">{{ $t('missionEstimates.batteryCapacityHint') }}</p>
        </div>
        <div class="mb-4">
          <v-checkbox
            v-model="vehicleStore.vehiclePayloadParameters.hasHighDragSensor"
            :label="$t('missionEstimates.hasProbe')"
            theme="dark"
            density="compact"
            hide-details
            class="w-full"
          />
          <p class="text-[11px] opacity-70 mt-1">{{ $t('missionEstimates.probeHint') }}</p>
        </div>
      </v-card-text>
      <v-divider class="mx-8" />
      <v-card-actions>
        <div class="flex justify-between w-full pa-1">
          <v-btn color="white" @click="isAboutMessageOpen = true">{{ $t('missionEstimates.aboutEstimates') }}</v-btn>
          <v-btn color="white" @click="isSettingsOpen = false">{{ $t('missionEstimates.close') }}</v-btn>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-dialog v-model="isAboutMessageOpen" persistent max-width="600px">
    <v-card :style="interfaceStore.globalGlassMenuStyles">
      <v-card-title class="text-lg text-center font-semibold">{{ $t('missionEstimates.aboutTitle') }}</v-card-title>
      <v-icon icon="mdi-close" class="absolute top-3 right-3" @click="isAboutMessageOpen = false" />
      <v-card-text class="text-sm">
        <p class="mb-4">{{ $t('missionEstimates.aboutText1') }}</p>
        <p class="mb-4">{{ $t('missionEstimates.aboutText2') }}</p>
        <p class="mb-4">{{ $t('missionEstimates.aboutText3') }}</p>
        <p class="mb-4">{{ $t('missionEstimates.aboutText4') }}</p>
        <p class="mb-4">{{ $t('missionEstimates.aboutText5') }}</p>
      </v-card-text>
      <v-divider class="mx-8" />
      <v-card-actions>
        <div class="flex justify-end w-full pa-1">
          <v-btn color="white" @click="isAboutMessageOpen = false">{{ $t('missionEstimates.close') }}</v-btn>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { useMissionEstimates } from '@/composables/useMissionEstimates'
import { MavType } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import { useAppInterfaceStore } from '@/stores/appInterface'
import { useMainVehicleStore } from '@/stores/mainVehicle'

defineProps<{
  /**
   * Whether the mission estimates panel is visible
   */
  modelValue: boolean
}>()
defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const interfaceStore = useAppInterfaceStore()
const vehicleStore = useMainVehicleStore()

const {
  totalMissionLength,
  totalSurveyCoverage,
  totalMissionDuration,
  totalMissionEnergy,
  missionCoverageAreaSquareMeters,
} = useMissionEstimates()

const isOptionsIconVisible = computed(() => vehicleStore.vehicleType === MavType.MAV_TYPE_SURFACE_BOAT)

const missionDuration = computed(() => totalMissionDuration.value)
const missionEnergy = computed(() => totalMissionEnergy.value)
const missionCoverage = computed(() => missionCoverageAreaSquareMeters.value)

const isSettingsOpen = ref(false)
const isAboutMessageOpen = ref(false)

const batteryChemistryItems = [
  { title: 'Li-ion', value: 'li-ion' },
  { title: 'Li-Po', value: 'li-po' },
  { title: 'LiFePO₄', value: 'lifepo4' },
]

const openSettings = (): void => {
  isSettingsOpen.value = true
}
</script>
