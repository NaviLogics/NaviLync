<template>
  <teleport to="body">
    <InteractionDialog v-model="showDialog" max-width="740" variant="text-only">
      <template #content>
        <div class="flex absolute top-0 right-0"><v-btn icon="mdi-close" variant="text" @click="closeDialog" /></div>
        <div class="flex flex-col justify-center align-center w-full h-full">
          <div class="relative">
            <img :src="CockpitLogo" alt="NaviLync Logo" class="w-64 my-4" />
            <img
              v-if="!isElectron()"
              :src="lite"
              alt="Cockpit lite"
              class="absolute w-24 right-4 bottom-5 rotate-[-20deg] my-4"
            />
          </div>
          <div class="w-[90%] flex justify-between my-6 py-3">
            <div class="w-[45%] flex flex-col text-start">
              <p class="mb-1">
                NaviLync is the NaviLogics ground control station for NAVIS ATLAS and other supported remote vehicles.
              </p>
              <p class="my-3">NaviLync is based on the open-source Cockpit project created by Blue Robotics.</p>
              <p class="mt-1">
                NaviLync is derived from the Blue Robotics Cockpit project and retains upstream attribution and
                licensing information.
              </p>
            </div>
            <div class="w-[45%] flex flex-col justify-end text-end">
              <p class="mb-1">
                Version
                <a :href="app_version.link" target="_blank" class="text-primary hover:underline">
                  {{ app_version.version }}
                </a>
                <br />
                <span class="text-sm text-gray-500">Released: {{ app_version.date }}</span>
              </p>
              <p class="my-3">NaviLync by NaviLogics · based on Cockpit by Blue Robotics</p>
              <p class="mt-1">Licensed under AGPL-3.0-only or LicenseRef-Cockpit-Custom</p>
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

import CockpitLogo from '@/assets/cockpit-logo.avif'
import lite from '@/assets/lite.avif'
import InteractionDialog from '@/components/InteractionDialog.vue'
import { app_version } from '@/libs/cosmos'
import { isElectron } from '@/libs/utils'

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
