<template>
  <div class="fixed inset-0 z-[9990] flex flex-col items-center justify-center bg-white">
    <!-- Whole on any screen: never wider than 80% of it nor taller than 60% of it -->
    <img
      :src="splashImage"
      alt="NaviLync"
      class="w-[80vw] max-w-[1150px] max-h-[60vh] object-contain select-none"
      draggable="false"
    />
    <v-progress-linear class="mt-10 w-[min(640px,60vw)]" color="#3D93C6" indeterminate rounded />

    <div class="fixed top-4 right-4 z-[9993]">
      <button
        class="rounded-full bg-black/5 p-1 text-slate-500 elevation-1 focus:outline-none"
        :aria-label="t('common.close')"
        @click="interfaceStore.showSplashScreen = false"
      >
        <v-icon icon="mdi-close" class="text-2xl -mt-[3px] -mr-[1px]" />
      </button>
    </div>
    <div class="fixed bottom-4 right-4 z-[9993]">
      <button
        class="rounded-full bg-black/5 p-1 text-slate-500 elevation-3 focus:outline-none"
        @click="toggleFullscreen"
      >
        <v-icon :icon="isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'" class="text-2xl -mt-[3px] -mr-[1px]" />
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useFullscreen } from '@vueuse/core'
import { onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import splashImage from '@/assets/splash-navilync.png'
import { useAppInterfaceStore } from '@/stores/appInterface'

const interfaceStore = useAppInterfaceStore()
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
const { t } = useI18n()

const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') interfaceStore.showSplashScreen = false
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>
