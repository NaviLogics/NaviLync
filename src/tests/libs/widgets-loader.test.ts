import { expect, test } from 'vitest'

import { MiniWidgetType, WidgetType } from '@/types/widgets'

// Check the registry without executing widgets and their network/storage side effects.
const widgets = import.meta.glob('../../components/widgets/*.vue')
const miniWidgets = import.meta.glob('../../components/mini-widgets/*.vue')

test('Test widgets exist', () => {
  for (const name of Object.values(WidgetType)) {
    expect(Object.keys(widgets)).toContain(`../../components/widgets/${name}.vue`)
  }
})

test('Test mini-widgets exist', () => {
  for (const name of Object.values(MiniWidgetType)) {
    expect(Object.keys(miniWidgets)).toContain(`../../components/mini-widgets/${name}.vue`)
  }
})
