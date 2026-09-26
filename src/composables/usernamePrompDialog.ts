import { v4 as uuid } from 'uuid'
import { createApp } from 'vue'

import UserNameInputDialog from '@/components/UserNameInputDialog.vue'
import { i18n } from '@/plugins/i18n'
import vuetify from '@/plugins/vuetify'
import router from '@/router'

export const askForUsername = (): Promise<string | undefined> => {
  return new Promise((resolve, reject) => {
    const mountPoint = document.createElement('div')
    mountPoint.id = `username-prompt-dialog-${uuid()}`
    document.body.appendChild(mountPoint)
    const dialogApp = createApp(UserNameInputDialog, {
      onConfirmed: (username: string) => {
        resolve(username)
        dialogApp.unmount()
        mountPoint.remove()
      },
      onDismissed: () => {
        reject()
        dialogApp.unmount()
        mountPoint.remove()
      },
    })
    dialogApp.use(vuetify)
    dialogApp.use(router)
    // The dialog runs as its own app, so it needs its own i18n install; without it useI18n() throws in setup
    dialogApp.use(i18n)
    dialogApp.mount(mountPoint)
  })
}
