<template>
  <div class="navis-status">
    <div class="header">
      <span>NAVIS ATLAS</span>
      <span class="subtitle">SYSTEM STATUS</span>
    </div>
    <div v-for="row in rows" :key="row.label" class="row">
      <span class="label">{{ row.label }}</span>
      <span class="value" :class="row.tone">{{ row.value }}</span>
    </div>
    <div v-if="reasonText !== 'OK'" class="reason">READY: {{ reasonText }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  getAllDataLakeVariablesInfo,
  getDataLakeVariableData,
  getDataLakeVariableLastUpdateTimestamp,
} from '@/libs/actions/data-lake'
import { useMainVehicleStore } from '@/stores/mainVehicle'
import type { Widget } from '@/types/widgets'

defineProps<{ widget: Widget }>()

const vehicle = useMainVehicleStore()
const tick = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

const aliases = [
  'SHOREOK',
  'RTCMOK',
  'RTCMAGE',
  'RTK_BPS',
  'FIXTYPE',
  'GPSAGE',
  'SATS',
  'HACC_CM',
  'READY',
  'RTKSTATE',
  'RDYCODE',
  'GPOSAGE',
  'ESTAGE',
  'HDGAGE',
  'RTKDWELL',
] as const

type Alias = (typeof aliases)[number]

/** Resolve a NAVIS health metric to its DataLake variable ID. */
const findVariable = (name: Alias): string | undefined => {
  tick.value
  const variables = getAllDataLakeVariablesInfo()
  const canonicalSuffix = `/NAMED_VALUE_FLOAT/${name}`
  const canonicalIntSuffix = `/NAMED_VALUE_INT/${name}`
  return Object.keys(variables).find(
    (id) => id.endsWith(canonicalSuffix) || id.endsWith(canonicalIntSuffix) || id === name
  )
}

/** Read a numeric NAVIS health metric. */
const metric = (name: Alias): number | undefined => {
  const id = findVariable(name)
  if (!id) return undefined
  const value = getDataLakeVariableData(id)
  return typeof value === 'number' ? value : undefined
}

/** Check whether a NAVIS health metric has been updated recently. */
const metricFresh = (name: Alias, maxAgeMs = 3000): boolean => {
  const id = findVariable(name)
  if (!id) return false
  const timestamp = getDataLakeVariableLastUpdateTimestamp(id)
  return timestamp !== undefined && performance.now() - timestamp <= maxAgeMs
}

/** Convert a boolean health state to the widget presentation model. */
const state = (ok: boolean, known = true): { value: string; tone: string } =>
  !known ? { value: '—', tone: 'unknown' } : ok ? { value: 'OK', tone: 'ok' } : { value: 'FAIL', tone: 'fail' }

const rows = computed(() => {
  tick.value
  const shoreKnown = metric('SHOREOK') !== undefined && metricFresh('SHOREOK')
  const rtcmKnown = metric('RTCMOK') !== undefined && metricFresh('RTCMOK')
  const fix = metric('FIXTYPE')
  const gpsAge = metric('GPSAGE')
  const gnssKnown = fix !== undefined && metricFresh('FIXTYPE')
  const readyKnown = metric('READY') !== undefined && metricFresh('READY')

  const shore = state(metric('SHOREOK') === 1, shoreKnown)
  const rtcm = state(
    metric('RTCMOK') === 1 && (metric('RTCMAGE') ?? Number.POSITIVE_INFINITY) < 3 && (metric('RTK_BPS') ?? 0) > 0,
    rtcmKnown
  )
  const mav = state(vehicle.isVehicleOnline, true)
  const gnss = state((fix ?? 0) >= 3 && (gpsAge ?? Number.POSITIVE_INFINITY) < 3, gnssKnown)
  const rtk = !gnssKnown
    ? { value: '—', tone: 'unknown' }
    : fix === 6
      ? { value: 'FIXED', tone: 'ok' }
      : { value: fix === 5 ? 'FLOAT' : 'FAIL', tone: fix === 5 ? 'warn' : 'fail' }
  const ready = state(metric('READY') === 1, readyKnown)

  return [
    { label: 'SHORE↔USV LINK', ...shore },
    { label: 'RTCM transport', ...rtcm },
    { label: 'MAVLink', ...mav },
    { label: 'GNSS Rover', ...gnss },
    { label: 'RTK FIXED', ...rtk },
    { label: 'MISSION READY', value: ready.value === 'OK' ? 'READY' : ready.value, tone: ready.tone },
    { label: 'USV MODE', value: vehicle.mode ?? '—', tone: vehicle.isVehicleOnline ? 'mode' : 'unknown' },
  ]
})

const reasonMap: Record<number, string> = {
  0: 'OK',
  1: 'STARTUP',
  2: 'MAV_STALE',
  3: 'GPS_STALE',
  4: 'BASE_WAIT',
  5: 'RTCM_STALE',
  6: 'NOT_FIXED',
  7: 'FIX_DWELL',
  8: 'SATS_LOW',
  9: 'HACC_BAD',
  10: 'GPOS_STALE',
  11: 'EST_STALE',
  12: 'EST_POS_BAD',
}

const reasonText = computed(() => {
  tick.value
  const code = metric('RDYCODE')
  return code === undefined ? 'NO DATA' : reasonMap[Math.trunc(code)] ?? `CODE ${code}`
})

onMounted(() => {
  timer = setInterval(() => tick.value++, 500)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.navis-status {
  width: 100%;
  height: 100%;
  min-width: 260px;
  padding: 14px 16px;
  border-radius: 10px;
  background: rgba(3, 28, 43, 0.88);
  color: white;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
  font-weight: 700;
}
.subtitle {
  font-size: 11px;
  opacity: 0.55;
  letter-spacing: 0.08em;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.label {
  opacity: 0.78;
  white-space: nowrap;
}
.value {
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
}
.ok {
  color: #6ee7a8;
}
.fail {
  color: #ff6b6b;
}
.warn {
  color: #ffd166;
}
.unknown {
  color: #94a3b8;
}
.mode {
  color: #7dd3fc;
}
.reason {
  margin-top: 9px;
  font-size: 11px;
  color: #ffd166;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
