<template>
  <BaseConfigurationView>
    <template #title>{{ t('general.title') }}</template>
    <template #content>
      <div
        class="flex-col h-full overflow-y-auto ml-[10px] pr-3 -mr-[10px]"
        :class="interfaceStore.isOnSmallScreen ? 'max-w-[80vw] max-h-[90vh]' : 'max-w-[650px] max-h-[85vh]'"
      >
        <ExpansiblePanel no-top-divider no-bottom-divider :is-expanded="!interfaceStore.isOnPhoneScreen">
          <template #title>{{ t('general.userSettings.title') }}</template>
          <template #info>
            <p class="w-full">
              {{ t('general.userSettings.description') }}
              <br />
              <br />
              <span class="font-semibold">{{ t('general.userSettings.title') }}</span>
              {{ t('general.userSettings.pirateModeDescription') }}
            </p>
          </template>
          <template #content>
            <div class="flex flex-col w-full items-start">
              <div class="flex align-center w-full justify-between pr-2 mt-1 mb-3">
                <div>
                  <span class="mr-2">{{ t('general.userSettings.currentUser') }}</span>
                  <span class="font-semibold text-2xl cursor-pointer" @click="missionStore.changeUsername">{{
                    missionStore.username
                  }}</span>
                </div>
                <div class="flex justify-end">
                  <v-btn
                    id="select-profile"
                    size="small"
                    append-icon="mdi-account"
                    class="bg-[#FFFFFF22] shadow-2 -mr-2"
                    variant="flat"
                    @click="missionStore.changeUsername"
                    >{{ t('general.userSettings.manageUsers') }}</v-btn
                  >
                </div>
              </div>
              <v-divider class="w-full opacity-[0.08]" />
              <div class="flex flex-row w-full items-center justify-between py-5 gap-x-2 flex-wrap">
                <v-btn size="x-small" class="bg-[#FFFFFF22] shadow-1" variant="flat" @click="openTutorial">
                  {{ t('general.userSettings.showTutorial') }}
                </v-btn>
                <v-btn
                  v-if="isElectron()"
                  size="x-small"
                  class="bg-[#FFFFFF22] shadow-1"
                  variant="flat"
                  @click="openCockpitFolder"
                >
                  {{ t('general.userSettings.openCockpitFolder') }}
                </v-btn>
                <v-btn
                  size="x-small"
                  class="bg-[#FFFFFF22] shadow-1"
                  variant="flat"
                  @click="showCockpitSettingsDialog = true"
                >
                  {{ t('general.userSettings.manageCockpitSettings') }}
                </v-btn>
                <v-btn
                  size="x-small"
                  class="bg-[#FFFFFF22] shadow-1"
                  variant="flat"
                  @click="interfaceStore.pirateMode = !interfaceStore.pirateMode"
                >
                  {{
                    interfaceStore.pirateMode
                      ? t('general.userSettings.disablePirateMode')
                      : t('general.userSettings.enablePirateMode')
                  }}
                </v-btn>
                <v-btn
                  size="x-small"
                  class="bg-[#FFFFFF22] shadow-1"
                  variant="flat"
                  @click="interfaceStore.isAdminMode = !interfaceStore.isAdminMode"
                >
                  {{
                    interfaceStore.isAdminMode
                      ? t('general.userSettings.disableAdminMode')
                      : t('general.userSettings.enableAdminMode')
                  }}
                </v-btn>
              </div>
            </div>
          </template>
        </ExpansiblePanel>

        <ExpansiblePanel :is-expanded="!interfaceStore.isOnPhoneScreen">
          <template #title>{{ t('general.vehicleConnection.title') }}</template>
          <template #subtitle>{{
            t('general.vehicleConnection.currentAddress', { address: mainVehicleStore.globalAddress })
          }}</template>
          <template #info>{{ t('general.vehicleConnection.description') }}</template>
          <template #content>
            <v-btn
              v-if="isElectron()"
              size="x-small"
              class="bg-[#FFFFFF22] mt-3 mb-2 shadow-2"
              variant="flat"
              @click="showDiscoveryDialog = true"
            >
              {{ t('general.vehicleConnection.searchVehicles') }}
            </v-btn>
            <v-form
              ref="globalAddressForm"
              v-model="globalAddressFormValid"
              class="flex w-full mt-2 mb-2"
              @submit.prevent="setGlobalAddress"
            >
              <div
                class="flex justify-start items-center w-[86%] mb-4"
                :class="interfaceStore.isOnSmallScreen ? 'scale-80' : 'scale-100'"
                :style="
                  interfaceStore.highlightedComponent === 'vehicle-address' && {
                    animation: 'highlightBackground 0.5s alternate 20',
                    borderRadius: '10px',
                  }
                "
              >
                <v-text-field
                  v-model="newGlobalAddress"
                  variant="filled"
                  type="input"
                  density="compact"
                  :hint="t('general.vehicleConnection.addressHint')"
                  hide-details
                  class="w-[80%]"
                  :rules="[isValidHostAddress, isValidConnectionURI]"
                  @click:append-inner="resetGlobalAddress"
                >
                  <template #append-inner>
                    <v-icon
                      v-tooltip.bottom="t('general.vehicleConnection.resetGlobalAddress')"
                      color="white"
                      @click="resetGlobalAddress"
                    >
                      mdi-refresh
                    </v-icon>
                  </template>
                </v-text-field>
                <v-btn
                  :size="interfaceStore.isOnSmallScreen ? 'small' : 'default'"
                  :disabled="!globalAddressFormValid"
                  class="bg-transparent"
                  :class="interfaceStore.isOnSmallScreen ? 'ml-1' : 'ml-5'"
                  variant="text"
                  type="submit"
                >
                  {{ t('common.apply') }}
                </v-btn>
              </div>
            </v-form>
          </template>
        </ExpansiblePanel>
        <ExpansiblePanel
          v-if="interfaceStore.isAdminMode"
          no-top-divider
          :is-expanded="!interfaceStore.isOnPhoneScreen"
        >
          <template #title>{{ t('general.mavlinkRest.title') }}</template>
          <template #subtitle>
            {{
              t('general.mavlinkRest.currentAddress', {
                address: ConnectionManager.mainConnection()?.uri().toString() ?? t('common.none'),
              })
            }}<br />
            {{ t('general.mavlinkRest.status') }}
            {{
              vehicleConnected
                ? t('general.mavlinkRest.connected')
                : vehicleConnected === undefined
                ? t('general.mavlinkRest.connecting')
                : t('general.mavlinkRest.failed')
            }}
          </template>
          <template #content>
            <v-progress-circular v-if="vehicleConnected === undefined" indeterminate size="24" class="mr-3" />
            <v-form
              ref="mainConnectionForm"
              v-model="mainConnectionFormValid"
              class="flex w-full mt-2"
              @submit.prevent="setMainVehicleConnectionURI"
            >
              <div class="flex flex-row w-full justify-start gap-x-8 align-center">
                <div
                  class="flex justify-start items-center"
                  :class="interfaceStore.isOnSmallScreen ? 'scale-80 w-[80%]' : 'scale-100 w-[76%]'"
                >
                  <v-text-field
                    v-model="mavlink2RestWebsocketURI"
                    :disabled="!mainVehicleStore.customMAVLink2RestWebsocketURI.enabled"
                    variant="filled"
                    type="input"
                    density="compact"
                    :hint="t('general.mavlinkRest.uriHint')"
                    :rules="[isValidSocketConnectionURI]"
                  >
                    <template #append-inner>
                      <v-icon
                        v-tooltip.bottom="t('general.mavlinkRest.resetToDefault')"
                        color="white"
                        :disabled="!mainVehicleStore.customMAVLink2RestWebsocketURI.enabled"
                        @click="resetMainVehicleConnectionURI"
                      >
                        mdi-refresh
                      </v-icon>
                    </template>
                  </v-text-field>
                </div>
                <v-btn
                  :size="interfaceStore.isOnSmallScreen ? 'small' : 'default'"
                  class="bg-transparent -mt-5 -ml-6"
                  :disabled="!mainVehicleStore.customMAVLink2RestWebsocketURI.enabled"
                  variant="text"
                  type="submit"
                >
                  {{ t('common.apply') }}
                </v-btn>
              </div>
              <div class="flex justify-end mt-6">
                <div
                  class="flex flex-col align-end text-[10px]"
                  :class="interfaceStore.isOnSmallScreen ? '-mt-3' : '-mt-5'"
                >
                  <v-switch
                    v-model="mainVehicleStore.customMAVLink2RestWebsocketURI.enabled"
                    v-tooltip.bottom="t('common.enableCustom')"
                    class="-mt-5 bg-transparent mr-1 mb-[7px]"
                    density="compact"
                    hide-details
                  />
                  <div class="-mt-[4px]">
                    {{
                      mainVehicleStore.customMAVLink2RestWebsocketURI.enabled
                        ? t('common.enabled')
                        : t('common.disabled')
                    }}
                  </div>
                </div>
              </div>
            </v-form>
          </template>
        </ExpansiblePanel>
        <ExpansiblePanel
          v-if="interfaceStore.isAdminMode"
          no-top-divider
          no-bottom-divider
          :is-expanded="!interfaceStore.isOnPhoneScreen"
        >
          <template #title>{{ t('general.videoConnection.title') }}</template>
          <template #subtitle>{{
            t('general.videoConnection.currentAddress', {
              address: mainVehicleStore.webRTCSignallingURI?.toString() ?? '',
            })
          }}</template>
          <template #content>
            <v-form
              ref="webRTCSignallingForm"
              v-model="webRTCSignallingFormValid"
              class="justify-center d-flex align-center mt-2"
              @submit.prevent="setWebRTCSignallingURI"
            >
              <div class="flex flex-row w-full justify-start gap-x-8 align-center">
                <div
                  class="flex justify-start items-center"
                  :class="interfaceStore.isOnSmallScreen ? 'scale-80 w-[80%]' : 'scale-100 w-[76%]'"
                >
                  <v-text-field
                    v-model="webRTCSignallingURI"
                    :disabled="!mainVehicleStore.customWebRTCSignallingURI.enabled"
                    variant="filled"
                    type="input"
                    density="compact"
                    :hint="t('general.videoConnection.uriHint')"
                    :rules="[isValidSocketConnectionURI]"
                  >
                    <template #append-inner>
                      <v-icon
                        v-tooltip.bottom="t('general.mavlinkRest.resetToDefault')"
                        color="white"
                        :disabled="!mainVehicleStore.customWebRTCSignallingURI.enabled"
                        @click="resetWebRTCSignallingURI"
                      >
                        mdi-refresh
                      </v-icon>
                    </template>
                  </v-text-field>
                </div>
                <v-btn
                  :size="interfaceStore.isOnSmallScreen ? 'small' : 'default'"
                  :disabled="!mainVehicleStore.customWebRTCSignallingURI.enabled || !webRTCSignallingFormValid"
                  class="bg-transparent -mt-5 -ml-6"
                  variant="text"
                  type="submit"
                >
                  {{ t('common.apply') }}
                </v-btn>
              </div>
              <div>
                <div
                  class="flex flex-col align-end text-[10px]"
                  :class="interfaceStore.isOnSmallScreen ? '-mt-3' : '-mt-5'"
                >
                  <v-switch
                    v-model="mainVehicleStore.customWebRTCSignallingURI.enabled"
                    v-tooltip.bottom="t('common.enableCustom')"
                    class="-mt-5 bg-transparent mr-1 mb-[7px]"
                    density="compact"
                    hide-details
                  />
                  <div class="-mt-[4px]">
                    {{
                      mainVehicleStore.customWebRTCSignallingURI.enabled ? t('common.enabled') : t('common.disabled')
                    }}
                  </div>
                </div>
              </div>
            </v-form>
          </template>
        </ExpansiblePanel>
        <ExpansiblePanel :is-expanded="!interfaceStore.isOnPhoneScreen">
          <template #title>{{ t('general.webrtcConfig.title') }}</template>
          <template #content>
            <div class="flex justify-between mt-2 w-full">
              <v-textarea
                id="rtcConfigTextInput"
                v-model="customRtcConfiguration"
                :disabled="!mainVehicleStore.customWebRTCConfiguration.enabled"
                variant="outlined"
                :label="t('general.webrtcConfig.label')"
                :rows="6"
                :hint="t('general.webrtcConfig.hint')"
                class="w-full"
              />
              <div class="flex flex-col justify-around align-center w-[100px] -mr-6">
                <v-btn
                  :size="interfaceStore.isOnSmallScreen ? 'small' : 'default'"
                  :disabled="!mainVehicleStore.customWebRTCConfiguration.enabled"
                  class="bg-transparent -mb-5"
                  variant="text"
                  type="submit"
                  @click="handleCustomRtcConfiguration"
                >
                  {{ t('common.apply') }}
                </v-btn>

                <div class="flex flex-col align-end text-[10px] -mt-8">
                  <v-switch
                    v-model="mainVehicleStore.customWebRTCConfiguration.enabled"
                    v-tooltip.bottom="t('common.enableCustom')"
                    class="-mt-5 bg-transparent"
                    rounded="lg"
                    hide-details
                  />
                  <div class="-mt-[4px]">
                    {{
                      mainVehicleStore.customWebRTCConfiguration.enabled ? t('common.enabled') : t('common.disabled')
                    }}
                  </div>
                </div>
              </div>
            </div>
          </template>
        </ExpansiblePanel>
        <ExpansiblePanel no-bottom-divider :is-expanded="!interfaceStore.isOnPhoneScreen">
          <template #title>{{ t('general.genericWebSocket.title') }}</template>
          <template #info>
            <div class="w-full">
              <p>{{ t('general.genericWebSocket.description') }}</p>
              <ul class="list-disc list-inside mt-2">
                <li>
                  {{ t('general.genericWebSocket.messageFormat') }}
                </li>
                <li>
                  {{ t('general.genericWebSocket.urlVariables') }}
                  <span class="font-mono">{{ exampleGenericWebSocketUrl }}</span>
                </li>
              </ul>
            </div>
          </template>
          <template #content>
            <div class="flex flex-col w-full mt-2 pb-8">
              <!-- Existing connections list -->
              <div v-if="Object.keys(genericWebSocketConnections).length > 0" class="mb-4">
                <div
                  v-for="(conn, url) in genericWebSocketConnections"
                  :key="url"
                  class="flex items-center justify-between py-2 px-3 mb-2 rounded bg-[#FFFFFF11]"
                >
                  <div class="flex items-center gap-2 flex-1 min-w-0">
                    <v-icon :color="getLoadingStatusColor(conn.status)" size="small">
                      {{ getLoadingStatusIcon(conn.status) }}
                    </v-icon>
                    <span class="truncate text-sm" :title="url">{{ replaceDataLakeInputsInString(url) }}</span>
                    <span class="text-xs opacity-60">({{ conn.status }})</span>
                  </div>
                  <v-btn icon="mdi-close" size="x-small" variant="text" @click="removeGenericWebSocket(url)" />
                </div>
              </div>
              <div v-else class="text-sm opacity-60 mb-4">{{ t('general.genericWebSocket.noConnections') }}</div>

              <!-- Add new connection -->
              <div class="flex justify-start items-center">
                <v-text-field
                  v-model="newGenericWebSocketUrl"
                  variant="outlined"
                  type="input"
                  density="compact"
                  :hint="exampleGenericWebSocketUrl"
                  hide-details
                  @keyup.enter="addGenericWebSocket"
                />
                <v-btn
                  :size="interfaceStore.isOnSmallScreen ? 'small' : 'default'"
                  :disabled="!newGenericWebSocketUrl.trim()"
                  class="bg-transparent"
                  :class="interfaceStore.isOnSmallScreen ? 'ml-1' : 'ml-5'"
                  variant="text"
                  @click="addGenericWebSocket"
                >
                  {{ t('general.genericWebSocket.addConnection') }}
                </v-btn>
              </div>
            </div>
          </template>
        </ExpansiblePanel>
      </div>
    </template>
  </BaseConfigurationView>
  <VehicleDiscoveryDialog v-model="showDiscoveryDialog" />
  <ManageCockpitSettings v-model:openConfigDialog="showCockpitSettingsDialog" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { defaultGlobalAddress } from '@/assets/defaults'
import ManageCockpitSettings from '@/components/configuration/CockpitSettingsManager.vue'
import ExpansiblePanel from '@/components/ExpansiblePanel.vue'
import VehicleDiscoveryDialog from '@/components/VehicleDiscoveryDialog.vue'
import { useSnackbar } from '@/composables/snackbar'
import * as Connection from '@/libs/connection/connection'
import { ConnectionManager } from '@/libs/connection/connection-manager'
import {
  addGenericWebSocketConnection,
  GenericWebSocketConnection,
  listenToGenericWebSocketConnections,
  removeGenericWebSocketConnection,
} from '@/libs/generic-websocket'
import { isElectron, isValidNetworkAddress } from '@/libs/utils'
import { getLoadingStatusColor, getLoadingStatusIcon } from '@/libs/utils/ui'
import { replaceDataLakeInputsInString } from '@/libs/utils-data-lake'
import { reloadCockpitAndWarnUser } from '@/libs/utils-vue'
import * as Protocol from '@/libs/vehicle/protocol/protocol'
import { useAppInterfaceStore } from '@/stores/appInterface'
import { useMainVehicleStore } from '@/stores/mainVehicle'
import { useMissionStore } from '@/stores/mission'

import BaseConfigurationView from './BaseConfigurationView.vue'

const mainVehicleStore = useMainVehicleStore()
const interfaceStore = useAppInterfaceStore()
const missionStore = useMissionStore()
const { openSnackbar } = useSnackbar()
const { t } = useI18n()

const globalAddressForm = ref()
const globalAddressFormValid = ref(false)
const newGlobalAddress = ref(mainVehicleStore.globalAddress)
const showCockpitSettingsDialog = ref(false)

const setGlobalAddress = async (): Promise<void> => {
  await globalAddressForm.value.validate()

  const validation = isValidConnectionURI(newGlobalAddress.value)
  if (validation !== true) {
    alert(validation)
    return
  }

  mainVehicleStore.globalAddress = newGlobalAddress.value

  // Temporary solution to actually set the address and connect the vehicle, since this is non-reactive today.
  // TODO: Modify the store variables to be reactive.
  reloadCockpitAndWarnUser()
}

const resetGlobalAddress = async (): Promise<void> => {
  newGlobalAddress.value = defaultGlobalAddress

  await setGlobalAddress()
}

const handleCustomRtcConfiguration = (): void => {
  if (mainVehicleStore.customWebRTCConfiguration.enabled) {
    updateWebRtcConfiguration()
  }
}

/** Main vehicle connection */

const vehicleConnected = ref<boolean | undefined>(mainVehicleStore.isVehicleOnline)
watch(
  () => mainVehicleStore.isVehicleOnline,
  () => (vehicleConnected.value = mainVehicleStore.isVehicleOnline)
)

const mainConnectionForm = ref()
const mainConnectionFormValid = ref(false)
const mavlink2RestWebsocketURI = ref(mainVehicleStore.MAVLink2RestWebsocketURI)

const addNewVehicleConnection = async (conn: Connection.URI): Promise<void> => {
  mavlink2RestWebsocketURI.value = conn
  vehicleConnected.value = undefined
  setTimeout(() => (vehicleConnected.value ??= false), 5000)
  try {
    ConnectionManager.addConnection(new Connection.URI(conn), Protocol.Type.MAVLink)
  } catch (error) {
    console.error(error)
    alert(t('errors.couldNotUpdateConnection', { error }))
    return
  }
  console.debug(`New connection successfully configured to ${conn.toString()}.`)
}

watch(
  () => mainVehicleStore.MAVLink2RestWebsocketURI,
  (val: Connection.URI) => {
    if (val.toString() === mavlink2RestWebsocketURI.value.toString()) {
      return
    }

    addNewVehicleConnection(val)
  }
)

const setMainVehicleConnectionURI = async (): Promise<void> => {
  const res = await mainConnectionForm.value.validate()

  if (!res.valid) {
    return
  }

  mainVehicleStore.customMAVLink2RestWebsocketURI = {
    data: mavlink2RestWebsocketURI.value.toString(),
    enabled: true,
  }

  addNewVehicleConnection(mavlink2RestWebsocketURI.value)
}

const resetMainVehicleConnectionURI = async (): Promise<void> => {
  mainVehicleStore.customMAVLink2RestWebsocketURI = {
    enabled: false,
    data: mainVehicleStore.defaultMAVLink2RestWebsocketURI.toString(),
  }
}

const webRTCSignallingForm = ref()
const webRTCSignallingFormValid = ref(false)
const webRTCSignallingURI = ref(mainVehicleStore.webRTCSignallingURI)

const addWebRTCConnection = async (conn: Connection.URI): Promise<void> => {
  webRTCSignallingURI.value = conn

  // This works as a reset for the custom URI, and its not needed in MAVLink2RestWebsocketURI since on Add from
  // ConnectionManager it will be set.
  if (!mainVehicleStore.customWebRTCSignallingURI.enabled) {
    mainVehicleStore.customWebRTCSignallingURI.data = conn.toString()
  }

  // Temporary solution to actually set WebRTC URI, since right now we cannot just make reactive because streams will
  // be kept open.
  // TODO: handle video stream re connection
  reloadCockpitAndWarnUser()
}

watch(
  () => mainVehicleStore.webRTCSignallingURI,
  (val: Connection.URI) => {
    if (val.toString() === webRTCSignallingURI.value.toString()) {
      return
    }

    addWebRTCConnection(val)
  }
)

const setWebRTCSignallingURI = async (): Promise<void> => {
  const res = await webRTCSignallingForm.value.validate()

  if (!res.valid) {
    return
  }

  mainVehicleStore.customWebRTCSignallingURI = {
    data: webRTCSignallingURI.value.toString(),
    enabled: true,
  }

  addWebRTCConnection(webRTCSignallingURI.value)
}

const resetWebRTCSignallingURI = (): void => {
  mainVehicleStore.customWebRTCSignallingURI = {
    enabled: false,
    data: mainVehicleStore.defaultWebRTCSignallingURI.toString(),
  }
}

const isValidHostAddress = (value: string): boolean | string => {
  return isValidNetworkAddress(value) ?? t('validation.invalidHostAddress')
}

const isValidConnectionURI = (value: string): boolean | string => {
  const forbiddenStartStrings = ['http://', 'https://', 'ws://', 'wss://']
  if (forbiddenStartStrings.some((protocol) => value.startsWith(protocol))) {
    return t('validation.noProtocol')
  }

  try {
    new Connection.URI(`ws://${value}:6040/`)
  } catch (error) {
    return t('validation.invalidConnectionUri', { error })
  }
  return true
}

const isValidSocketConnectionURI = (value: string): boolean | string => {
  try {
    const conn = new Connection.URI(value)
    if (!isElectron() && conn.type() !== Connection.Type.WebSocket && conn.type() !== Connection.Type.Serial) {
      throw new Error(t('validation.invalidSocketUri'))
    }
    if (
      isElectron() &&
      conn.type() !== Connection.Type.WebSocket &&
      conn.type() !== Connection.Type.Serial &&
      conn.type() !== Connection.Type.UdpIn &&
      conn.type() !== Connection.Type.UdpOut &&
      conn.type() !== Connection.Type.UdpBroadcast &&
      conn.type() !== Connection.Type.TcpIn &&
      conn.type() !== Connection.Type.TcpOut
    ) {
      throw new Error(t('validation.invalidElectronUri'))
    }
  } catch (error) {
    return t('validation.invalidConnectionUri', { error })
  }
  return true
}

const customRtcConfiguration = ref<string>(JSON.stringify(mainVehicleStore.customWebRTCConfiguration.data, null, 4))
const updateWebRtcConfiguration = (): void => {
  try {
    const newConfig = JSON.parse(customRtcConfiguration.value)
    mainVehicleStore.customWebRTCConfiguration.data = newConfig
    reloadCockpitAndWarnUser()
  } catch (error) {
    alert(t('errors.couldNotUpdateWebrtc', { error }))
  }
}

const tryToPrettifyRtcConfig = (): void => {
  try {
    const ugly = customRtcConfiguration.value
    const obj = JSON.parse(ugly)
    const pretty = JSON.stringify(obj, null, 4)
    if (ugly !== pretty) {
      customRtcConfiguration.value = pretty
    }
  } catch (error) {
    // Do nothing if the JSON is invalid
  }
}

const openTutorial = (): void => {
  interfaceStore.isMainMenuVisible = false
  interfaceStore.isTutorialVisible = true
}

watch(customRtcConfiguration, () => tryToPrettifyRtcConfig())

const showDiscoveryDialog = ref(false)

// Generic WebSocket connections
const exampleGenericWebSocketUrl = 'ws://{{ vehicle-address }}:1234'
const genericWebSocketConnections = ref<Record<string, GenericWebSocketConnection>>({})
const newGenericWebSocketUrl = ref(exampleGenericWebSocketUrl)
let unsubscribeGenericWebSocket: (() => void) | null = null

onMounted(() => {
  tryToPrettifyRtcConfig()
  unsubscribeGenericWebSocket = listenToGenericWebSocketConnections((connections) => {
    genericWebSocketConnections.value = connections
  })
})

onUnmounted(() => {
  if (unsubscribeGenericWebSocket) {
    unsubscribeGenericWebSocket()
  }
})

const addGenericWebSocket = (): void => {
  const url = newGenericWebSocketUrl.value.trim()
  if (!url) return

  addGenericWebSocketConnection(url)
  newGenericWebSocketUrl.value = ''
}

const removeGenericWebSocket = (url: string): void => {
  removeGenericWebSocketConnection(url)
}

const openCockpitFolder = (): void => {
  if (isElectron() && window.electronAPI) {
    window.electronAPI?.openCockpitFolder()
  } else {
    openSnackbar({
      message: t('errors.desktopOnly'),
      duration: 3000,
      variant: 'error',
      closeButton: true,
    })
  }
}
</script>
<style scoped>
.uri-input {
  width: 100% !important;
}
</style>
