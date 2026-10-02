<template>
  <v-btn class="autopilot-reboot" variant="outlined" size="small">{{ t('autopilotReboot.button') }}</v-btn>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>
