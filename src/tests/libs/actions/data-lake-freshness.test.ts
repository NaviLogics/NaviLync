import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  createDataLakeVariable,
  getDataLakeVariableLastUpdateTimestamp,
  setDataLakeVariableData,
} from '@/libs/actions/data-lake'

// Bench, run 58: the NAVIS metrics are sent as NAMED_VALUE and most of them keep the same value (SHOREOK = 1, READY = 1).
// Their freshness must count from the arrival of the last message, not from the last change of the value.
describe('data-lake variable timestamps', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('a message that repeats the same value still refreshes the timestamp', () => {
    const id = '/mavlink/1/1/NAMED_VALUE_FLOAT/SHOREOK_TIMESTAMP_TEST'
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(1000)
    createDataLakeVariable({ id, name: id, type: 'number' })
    setDataLakeVariableData(id, 1)

    now.mockReturnValue(7000)
    setDataLakeVariableData(id, 1)

    expect(getDataLakeVariableLastUpdateTimestamp(id)).toBe(7000)
  })
})
