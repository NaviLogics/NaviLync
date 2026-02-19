<template>
  <BaseConfigurationView>
    <template #title>{{ t('interface.title') }}</template>
    <template #content>
      <div class="max-h-[85vh] overflow-y-auto">
        <ExpansiblePanel no-top-divider :is-expanded="!interfaceStore.isOnPhoneScreen">
          <template #title>{{ t('interface.language.title') }}</template>
          <template #content>
            <div class="flex w-full">
              <div class="flex flex-col w-full px-4 pt-5">
                <div class="flex flex-row justify-start items-center w-full mb-[35px]">
                  <div class="flex w-[33%]">{{ t('interface.language.select') }}</div>
                  <div class="flex w-[66%]">
                    <v-radio-group v-model="currentLocale" inline hide-details @update:model-value="changeLanguage">
                      <v-radio :label="t('interface.language.russian')" value="ru" />
                      <v-radio :label="t('interface.language.english')" value="en" class="ml-6" />
                    </v-radio-group>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </ExpansiblePanel>
        <ExpansiblePanel no-top-divider :is-expanded="!interfaceStore.isOnPhoneScreen">
          <template #title>{{ t('interface.windowMaterial.title') }}</template>
          <template #content>
            <div class="flex w-full">
              <div class="flex flex-col w-full px-4 pt-5">
                <div class="flex flex-row justify-start items-center w-full mb-[35px] gap-x-[85px]">
                  <div class="flex">
                    <v-menu
                      :close-on-content-click="false"
                      location="top start"
                      origin="top start"
                      transition="scale-transition"
                      class="overflow-hidden"
                    >
                      <template #activator="{ props }">
                        <div v-bind="props" class="flex cursor-pointer gap-x-[30px]">
                          <span class="text-start mt-[2px]">{{ t('interface.windowMaterial.glassColor') }}</span>
                          <div
                            class="w-[30px] h-[30px] border-2 border-slate-600 rounded-lg cursor-pointer"
                            :style="{ backgroundColor: interfaceStore.UIGlassEffect.bgColor }"
                          ></div>
                        </div>
                      </template>
                      <v-card class="overflow-hidden"
                        ><v-color-picker
                          v-model="interfaceStore.UIGlassEffect.bgColor"
                          width="400px"
                          mode="rgba"
                          theme="dark"
                      /></v-card>
                    </v-menu>
                  </div>
                  <div class="flex gap-x-[40px] opacity-40">
                    <v-menu
                      :close-on-content-click="false"
                      location="top start"
                      origin="top start"
                      transition="scale-transition"
                      class="overflow-hidden"
                      disabled
                    >
                      <template #activator="{ props }">
                        <div v-bind="props" class="flex gap-x-[30px]">
                          <span class="text-start mt-[2px]">{{ t('interface.windowMaterial.fontColor') }}</span>
                          <div
                            v-bind="props"
                            class="w-[30px] h-[30px] border-2 border-slate-600 rounded-lg"
                            :style="{ backgroundColor: interfaceStore.UIGlassEffect.fontColor }"
                          ></div>
                        </div>
                      </template>
                      <v-card class="overflow-hidden"
                        ><v-color-picker
                          v-model="interfaceStore.UIGlassEffect.fontColor"
                          width="400px"
                          mode="rgba"
                          theme="dark"
                      /></v-card>
                    </v-menu>
                  </div>
                  <v-btn variant="text" size="small" @click="resetColorsToDefault">{{
                    t('interface.windowMaterial.resetToDefaults')
                  }}</v-btn>
                </div>
                <div class="flex w-full">
                  <div class="flex w-[33%] mt-[2px]">{{ t('interface.windowMaterial.opacity') }}</div>
                  <div class="flex w-[66%]">
                    <v-slider
                      :model-value="parseInt(interfaceStore.UIGlassEffect.bgColor.slice(-2), 16) / 255"
                      color="white"
                      min="0"
                      max="1"
                      step="0.01"
                      thumb-label
                      @update:model-value="updateOpacity"
                    />
                  </div>
                </div>
                <div class="flex w-full">
                  <div class="flex w-[33%] mt-[2px]">{{ t('interface.windowMaterial.blur') }}</div>
                  <div class="flex w-[66%]">
                    <v-slider
                      v-model="interfaceStore.UIGlassEffect.blur"
                      color="white"
                      min="0"
                      max="50"
                      step="1"
                      thumb-label
                    />
                  </div>
                </div>
              </div>
            </div>
          </template>
        </ExpansiblePanel>
        <ExpansiblePanel no-bottom-divider no-top-divider :is-expanded="!interfaceStore.isOnPhoneScreen">
          <template #title>{{ t('interface.menu.title') }}</template>
          <template #content>
            <div class="flex w-full">
              <div class="flex flex-col w-full px-4 pt-5">
                <div class="flex flex-row justify-start items-center w-full mb-[35px]">
                  <div class="flex w-[33%]">{{ t('interface.menu.triggerPosition') }}</div>
                  <div class="flex w-[66%]">
                    <v-radio-group v-model="interfaceStore.mainMenuStyleTrigger" inline hide-details>
                      <v-radio :label="t('interface.menu.centerLeftTab')" value="center-left" />
                      <v-radio :label="t('interface.menu.topBarButton')" value="burger" class="ml-6" />
                    </v-radio-group>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </ExpansiblePanel>
        <ExpansiblePanel no-bottom-divider :is-expanded="!interfaceStore.isOnPhoneScreen">
          <template #title>{{ t('interface.displayUnits.title') }}</template>
          <template #content>
            <div class="flex w-full">
              <div class="flex flex-col w-full px-4 pt-5">
                <div class="flex flex-row justify-start items-center w-full mb-[35px]">
                  <div class="flex w-[33%]">{{ t('interface.displayUnits.distance') }}</div>
                  <div class="flex w-[66%]">
                    <v-radio-group v-model="interfaceStore.displayUnitPreferences.distance" inline hide-details>
                      <v-radio
                        :label="unitPrettyName[DistanceDisplayUnit.Meters]"
                        :value="DistanceDisplayUnit.Meters"
                      />
                      <v-radio
                        :label="unitPrettyName[DistanceDisplayUnit.Feet]"
                        :value="DistanceDisplayUnit.Feet"
                        class="ml-6"
                      />
                    </v-radio-group>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </ExpansiblePanel>
      </div>
    </template>
  </BaseConfigurationView>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { defaultUIGlassColor } from '@/assets/defaults'
import ExpansiblePanel from '@/components/ExpansiblePanel.vue'
import { DistanceDisplayUnit, unitPrettyName } from '@/libs/units'
import i18n, { type SupportedLocale } from '@/plugins/i18n'
import { useAppInterfaceStore } from '@/stores/appInterface'

import BaseConfigurationView from './BaseConfigurationView.vue'

const { t } = useI18n()
const interfaceStore = useAppInterfaceStore()

// Language switcher
const currentLocale = ref<SupportedLocale>(i18n.global.locale.value as SupportedLocale)

const changeLanguage = (locale: SupportedLocale): void => {
  i18n.global.locale.value = locale
  localStorage.setItem('cockpit-locale', locale)
}

// Restore saved locale on mount
const savedLocale = localStorage.getItem('cockpit-locale') as SupportedLocale | null
if (savedLocale && ['ru', 'en'].includes(savedLocale)) {
  currentLocale.value = savedLocale
  i18n.global.locale.value = savedLocale
}

// Watch for external locale changes
watch(
  () => i18n.global.locale.value,
  (newLocale) => {
    currentLocale.value = newLocale as SupportedLocale
  }
)

const updateOpacity = (value: number): void => {
  interfaceStore.setBgOpacity(value)
}

const resetColorsToDefault = (): void => {
  interfaceStore.UIGlassEffect = defaultUIGlassColor
}
</script>
