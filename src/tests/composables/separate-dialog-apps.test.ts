import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'

import { i18n } from '@/plugins/i18n'

// These dialogs are mounted as their own Vue apps, outside the main app. Each component calls useI18n() in setup, so
// if its app is created without the i18n plugin the setup throws, Vue swallows the error and nothing is shown.
vi.mock('@/plugins/vuetify', async () => {
  const { createVuetify } = await import('vuetify')
  return { default: createVuetify() }
})
vi.mock('@/router', () => ({ default: { install: () => undefined } }))
vi.mock('@/stores/appInterface', () => ({
  useAppInterfaceStore: () => ({ globalGlassMenuStyles: {}, isOnPhoneScreen: false, isMainMenuVisible: false }),
}))
vi.mock('@/stores/alert', () => ({
  useAlertStore: () => ({ neverShowArmedMenuWarning: false, skipArmedMenuWarningThisSession: false }),
}))
vi.mock('@/stores/mainVehicle', () => ({ useMainVehicleStore: () => ({ isArmed: true }) }))
vi.mock('@/stores/mission', () => ({ useMissionStore: () => ({ username: undefined }) }))

const setupErrors: string[] = []
let warnSpy: ReturnType<typeof vi.spyOn>

// Waits until the text is on the page, or up to 2 s: under a loaded test run, mounting a separate app with
// Vuetify can take more than a few ticks
const flushRendering = async (expectedText?: string): Promise<void> => {
  for (let i = 0; i < 200; i += 1) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 10))
    if (i >= 5 && (expectedText === undefined || document.body.textContent?.includes(expectedText))) return
  }
}

describe('dialogs mounted as separate apps render', () => {
  beforeEach(() => {
    setupErrors.length = 0
    document.body.innerHTML = ''
    warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      const text = args.map(String).join(' ')
      // Only a failing setup of the dialog component itself; Vuetify internals that need browser APIs jsdom lacks
      // (e.g. the progress spinner's IntersectionObserver) are not what these tests are about
      const failingComponent = /\n\s*at <(\w+)/.exec(text)?.[1]
      if (text.includes('Unhandled error during execution of setup function') && failingComponent?.endsWith('Dialog')) {
        setupErrors.push(text)
      }
    })
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  test('the interaction dialog used for confirmations and errors', async () => {
    const { useInteractionDialog } = await import('@/composables/interactionDialog')
    const { showDialog } = useInteractionDialog()

    void showDialog({
      message: 'Probe message',
      variant: 'warning',
      actions: [{ text: 'Probe action', action: vi.fn() }],
    })
    await flushRendering('Probe action')

    expect(setupErrors).toEqual([])
    expect(document.body.textContent).toContain('Probe message')
    expect(document.body.textContent).toContain('Probe action')
  })

  test('the arm safety dialog shown when the menu is opened while armed', async () => {
    const { openMainMenuIfSafeOrDesired } = await import('@/composables/armSafetyDialog')

    openMainMenuIfSafeOrDesired()
    await flushRendering(i18n.global.t('armSafety.title'))

    expect(setupErrors).toEqual([])
    expect(document.body.textContent).toContain(i18n.global.t('armSafety.title'))
  })

  test('the username prompt', async () => {
    const { askForUsername } = await import('@/composables/usernamePrompDialog')

    void askForUsername().catch(() => undefined)
    await flushRendering()

    // Its progress spinner cannot render under jsdom, so only the dialog's own setup is checked here
    expect(setupErrors).toEqual([])
  })
})
