<template>
  <v-btn class="onboard-shutdown" variant="outlined" size="small">{{ t('onboardShutdown.button') }}</v-btn>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>
