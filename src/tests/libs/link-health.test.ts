import { describe, expect, test } from 'vitest'

import { type LinkContext, linkHealth, LinkOutageJournal } from '@/libs/link-health'

// Release 1.0, task 8: PX4 lost the GCS for 48 of 48 s (log 33), 615 of 1307 s (log 46) and 150 of 150 s (log 47)
describe('link state from the HEARTBEAT age', () => {
  test('under 2 s: normal', () => {
    expect(linkHealth(0)).toBe('ok')
    expect(linkHealth(1500)).toBe('ok')
  })

  test('a HEARTBEAT missing for 3 s: yellow', () => {
    expect(linkHealth(3000)).toBe('degraded')
    expect(linkHealth(5000)).toBe('degraded')
  })

  test('6 s: red, as PX4 itself gives the GCS up after COM_DL_LOSS_T = 5 s', () => {
    expect(linkHealth(6000)).toBe('lost')
  })

  test('no HEARTBEAT at all: no state', () => {
    expect(linkHealth(undefined)).toBe('none')
  })
})

describe('journal of link losses in the session', () => {
  const t0 = 1_700_000_000_000
  const inMission: LinkContext = { mode: 'Mission', armed: true }

  // Ticks the journal every 500 ms from `from` to `to` with HEARTBEATs stopped at `lastHeartbeat`
  const run = (
    journal: LinkOutageJournal,
    from: number,
    to: number,
    lastHeartbeat: number,
    context = inMission
  ): void => {
    for (let now = from; now <= to; now += 500) journal.update(now, lastHeartbeat, context)
  }

  test('a 3 s gap is not a loss: no entry', () => {
    const journal = new LinkOutageJournal()
    run(journal, t0, t0 + 3000, t0)
    run(journal, t0 + 3500, t0 + 4000, t0 + 3500)
    expect(journal.outages).toEqual([])
  })

  test('6 s without HEARTBEAT: an entry from the last HEARTBEAT, with the mode and arming of that moment', () => {
    const journal = new LinkOutageJournal()
    run(journal, t0, t0 + 2000, t0)
    // The store forgets the arming state once offline; the journal keeps what it was when the link went bad
    run(journal, t0 + 2500, t0 + 6000, t0, { mode: 'Mission', armed: undefined })

    expect(journal.outages).toHaveLength(1)
    expect(journal.outages[0]).toMatchObject({ startedAt: t0, ended: false, context: { mode: 'Mission', armed: true } })
    expect(journal.outages[0].durationMs).toBe(6000)
  })

  test('when HEARTBEATs come back the entry ends with the length of the loss', () => {
    const journal = new LinkOutageJournal()
    run(journal, t0, t0 + 20_000, t0)
    journal.update(t0 + 20_100, t0 + 20_100, inMission)

    expect(journal.outages).toHaveLength(1)
    expect(journal.outages[0]).toMatchObject({ startedAt: t0, ended: true, durationMs: 20_100 })
  })

  test('two losses make two entries', () => {
    const journal = new LinkOutageJournal()
    run(journal, t0, t0 + 7000, t0)
    journal.update(t0 + 7100, t0 + 7100, inMission)
    run(journal, t0 + 7600, t0 + 20_000, t0 + 7100, { mode: 'Hold', armed: false })
    journal.update(t0 + 20_100, t0 + 20_100, inMission)

    expect(journal.outages.map((outage) => outage.context.mode)).toEqual(['Mission', 'Hold'])
    expect(journal.outages.every((outage) => outage.ended)).toBe(true)
  })

  test('before the first HEARTBEAT there is nothing to lose', () => {
    const journal = new LinkOutageJournal()
    run(journal, t0, t0 + 10_000, undefined as unknown as number)
    expect(journal.outages).toEqual([])
  })
})
