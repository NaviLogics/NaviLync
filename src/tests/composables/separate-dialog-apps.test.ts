import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'

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

const flushRendering = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('dialogs mounted as separate apps render', () => {
  beforeEach(() => {
    setupErrors.length = 0
    document.body.innerHTML = ''
    warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      const text = args.map(String).join(' ')
      if (text.includes('Unhandled error during execution of setup function')) setupErrors.push(text)
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
    await flushRendering()

    expect(setupErrors).toEqual([])
    expect(document.body.textContent).toContain('Probe message')
    expect(document.body.textContent).toContain('Probe action')
  })

  test('the arm safety dialog shown when the menu is opened while armed', async () => {
    const { openMainMenuIfSafeOrDesired } = await import('@/composables/armSafetyDialog')

    openMainMenuIfSafeOrDesired()
    await flushRendering()

    expect(setupErrors).toEqual([])
    expect(document.querySelector('[id^="arm-safety-dialog-"]')?.childElementCount ?? 0).toBeGreaterThan(0)
  })

  test('the username prompt', async () => {
    const { askForUsername } = await import('@/composables/usernamePrompDialog')

    void askForUsername().catch(() => undefined)
    await flushRendering()

    expect(setupErrors).toEqual([])
    expect(document.querySelector('[id^="username-prompt-dialog-"]')?.childElementCount ?? 0).toBeGreaterThan(0)
  })
})
