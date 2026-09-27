<template>
  <!-- The mission name is not shown in the top bar for the pilot (branding task): it stays in the mission store and
  still names recordings and logs; only its label, with the random placeholder name, is hidden -->
  <teleport to="body">
    <v-dialog v-model="widgetStore.miniWidgetManagerVars(miniWidget.hash).configMenuOpen" width="50%">
      <v-card class="pa-2 bg-[#20202022] backdrop-blur-2xl text-white rounded-lg">
        <v-card-title class="flex justify-between">
          <div />
          <div>{{ $t('missionConfig.title') }}</div>
          <v-btn
            icon
            :width="38"
            :height="34"
            variant="text"
            class="bg-transparent -mt-1 -mr-3"
            @click="widgetStore.miniWidgetManagerVars(miniWidget.hash).configMenuOpen = false"
          >
            <v-icon
              :size="interfaceStore.isOnSmallScreen ? 22 : 26"
              :class="interfaceStore.isOnSmallScreen ? '-mr-[10px] -mt-[10px]' : '-mr-[2px]'"
              >mdi-close</v-icon
            >
          </v-btn>
        </v-card-title>
        <v-card-text>
          <div class="flex flex-col">
            <p>{{ $t('missionConfig.missionName') }}</p>
            <v-text-field
              v-model="store.missionName"
              append-inner-icon="mdi-restore"
              class="mt-1"
              @click:append-inner="store.missionName = store.lastMissionName"
            />
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </teleport>
</template>

<script setup lang="ts">
import { toRefs } from 'vue'

import { useAppInterfaceStore } from '@/stores/appInterface'
import { useMissionStore } from '@/stores/mission'
import { useWidgetManagerStore } from '@/stores/widgetManager'
import type { MiniWidget } from '@/types/widgets'

/**
 * Props for the BatteryIndicator component
 */
const props = defineProps<{
  /**
   * Configuration of the widget
   */
  miniWidget: MiniWidget
}>()
const miniWidget = toRefs(props).miniWidget

const store = useMissionStore()
const widgetStore = useWidgetManagerStore()
const interfaceStore = useAppInterfaceStore()
</script>
