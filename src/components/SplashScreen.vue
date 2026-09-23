<template>
  <div class="fixed inset-0 z-[9990] flex items-center justify-center bg-[#031c2b] text-white">
    <div class="absolute inset-0 navis-grid" />
    <div class="relative z-[9992] flex w-[min(760px,86vw)] flex-col items-center rounded-2xl border border-white/20 bg-black/20 px-10 py-12 shadow-2xl backdrop-blur-md">
      <div class="text-center">
        <div class="text-5xl font-bold tracking-[0.08em]">NaviLync</div>
        <div class="mt-3 text-sm tracking-[0.32em] text-white/60">NAVIS ATLAS</div>
      </div>
      <div class="mt-10 h-px w-2/3 bg-white/15" />
      <p class="mt-8 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-lg text-white/80">
        {{ t('splashScreen.loading') }}
      </p>
      <v-progress-linear class="mt-5 w-2/3" indeterminate rounded />
    </div>

    <div class="fixed top-4 right-4 z-[9993]">
      <button
        class="rounded-full bg-white/10 p-1 text-white elevation-1 focus:outline-none"
        :aria-label="t('common.close')"
        @click="interfaceStore.showSplashScreen = false"
      >
        <v-icon icon="mdi-close" class="text-2xl -mt-[3px] -mr-[1px]" />
      </button>
    </div>
    <div class="fixed bottom-4 right-4 z-[9993]">
      <button
        class="rounded-full bg-white/10 p-1 text-white elevation-3 focus:outline-none"
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

<style scoped>
.navis-grid {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
  background-size: 40px 40px;
  mask-image: radial-gradient(circle at center, black 0%, transparent 75%);
}
</style>
