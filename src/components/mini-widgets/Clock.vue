<template>
  <div
    class="flex items-center justify-center m-2 text-sm font-bold text-center text-white select-none min-w-[90px] whitespace-nowrap"
  >
    {{ formatClockDateTime(timeNow, locale) }}
  </div>
</template>

<script setup lang="ts">
import { useTimestamp } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import { formatClockDateTime } from '@/libs/display-format'

const { locale } = useI18n()
const timeNow = useTimestamp({ interval: 1000 })
</script>
