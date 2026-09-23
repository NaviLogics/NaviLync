<template>
  <teleport to="body">
    <InteractionDialog v-model="showDialog" max-width="740" variant="text-only">
      <template #content>
        <div class="flex absolute top-0 right-0"><v-btn icon="mdi-close" variant="text" @click="closeDialog" /></div>
        <div class="flex flex-col justify-center align-center w-full h-full">
          <div class="my-5 text-center">
            <div class="text-4xl font-bold tracking-[0.08em]">NaviLync</div>
            <div class="mt-2 text-xs tracking-[0.28em] opacity-60">NAVIS ATLAS</div>
          </div>
          <div class="w-[90%] flex justify-between my-6 py-3">
            <div class="w-[45%] flex flex-col text-start">
              <p class="mb-1">{{ t('about.description') }}</p>
              <p class="my-3">{{ t('about.upstream') }}</p>
              <p class="mt-1">{{ t('about.attribution') }}</p>
            </div>
            <div class="w-[45%] flex flex-col justify-end text-end">
              <p class="mb-1">
                {{ t('about.version') }}
                <a :href="app_version.link" target="_blank" class="text-primary hover:underline">
                  {{ app_version.version }}
                </a>
                <br />
                <span class="text-sm text-gray-500">{{ t('about.released', { date: app_version.date }) }}</span>
              </p>
              <p class="my-3">{{ t('about.credit') }}</p>
              <p class="mt-1">{{ t('about.license') }}</p>
            </div>
          </div>
          <div class="mb-5 flex justify-center align-center">
            <v-btn
              class="mx-3"
              variant="text"
              icon="mdi-github"
              size="xs"
              target="_blank"
              href="https://github.com/NaviLogics/NaviLync"
            />
            <v-btn class="mx-3" variant="text" icon="mdi-web" size="xs" target="_blank" href="https://navilogics.ru" />
            <v-btn
              class="mx-3"
              variant="text"
              icon="mdi-file-document-outline"
              size="xs"
              target="_blank"
              href="https://blueos.cloud/cockpit/docs"
            />
          </div>
        </div>
      </template>
      <template #actions
        ><div class="flex w-full justify-end">
          <v-btn @click="closeDialog">{{ t('common.close') }}</v-btn>
        </div></template
      >
    </InteractionDialog>
  </teleport>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import InteractionDialog from '@/components/InteractionDialog.vue'
import { app_version } from '@/libs/cosmos'

const { t } = useI18n()
const showDialog = ref(true)
const emit = defineEmits(['update:showAboutDialog'])

const closeDialog = (): void => {
  showDialog.value = false
  emit('update:showAboutDialog', false)
}

watch(
  () => showDialog.value,
  (newVal) => {
    if (!newVal) {
      emit('update:showAboutDialog', false)
    }
  }
)

onUnmounted(() => {
  showDialog.value = false
})
</script>
