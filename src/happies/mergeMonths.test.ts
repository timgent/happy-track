import { describe, expect, it } from 'vitest'
import { mergeHappyMonths, monthsEqual, withHappy, withoutHappy } from './mergeMonths'
import type { Happy, HappyMonth } from './types'

function happy(id: string, overrides: Partial<Happy> = {}): Happy {
    return {
        id,
        date: '2026-09-10',
        text: `happy ${id}`,
        createdAt: '2026-09-10T08:00:00.000Z',
        lastModified: '2026-09-10T08:00:00.000Z',
        ...overrides,
    }
}

function month(happies: Happy[], overrides: Partial<HappyMonth> = {}): HappyMonth {
    return { month: '2026-09', happies, deletions: [], ...overrides }
}

describe('mergeHappyMonths', () => {
    it('keeps a happy only one side has', () => {
        // The case that matters most: two devices each wrote something while
        // apart. Neither entry may be lost, whichever copy the pod happens to
        // be holding.
        const local = month([happy('a')])
        const remote = month([happy('b')])

        const merged = mergeHappyMonths(local, remote)

        expect(merged.happies.map(h => h.id).sort()).toEqual(['a', 'b'])
    })

    it('takes the newer version of a happy both sides have', () => {
        const local = month([happy('a', { text: 'local edit', lastModified: '2026-09-10T10:00:00.000Z' })])
        const remote = month([happy('a', { text: 'remote edit', lastModified: '2026-09-10T09:00:00.000Z' })])

        expect(mergeHappyMonths(local, remote).happies[0].text).toBe('local edit')
        expect(mergeHappyMonths(remote, local).happies[0].text).toBe('local edit')
    })

    it('is order-independent for the same inputs', () => {
        const local = month([happy('a', { lastModified: '2026-09-10T10:00:00.000Z' }), happy('b')])
        const remote = month([happy('a', { lastModified: '2026-09-10T11:00:00.000Z' }), happy('c')])

        const one = mergeHappyMonths(local, remote)
        const other = mergeHappyMonths(remote, local)

        expect(monthsEqual(one, other)).toBe(true)
    })

    it('sorts the result by day, then by when it was written', () => {
        const local = month([
            happy('later', { date: '2026-09-11', createdAt: '2026-09-11T08:00:00.000Z' }),
            happy('evening', { date: '2026-09-10', createdAt: '2026-09-10T20:00:00.000Z' }),
        ])
        const remote = month([happy('morning', { date: '2026-09-10', createdAt: '2026-09-10T07:00:00.000Z' })])

        expect(mergeHappyMonths(local, remote).happies.map(h => h.id))
            .toEqual(['morning', 'evening', 'later'])
    })

    describe('deletions', () => {
        it('removes a happy the other side deleted', () => {
            const local = month([happy('a'), happy('b')])
            const remote = month([happy('b')], {
                deletions: [{ id: 'a', deletedAt: '2026-09-10T09:00:00.000Z' }],
            })

            const merged = mergeHappyMonths(local, remote)

            expect(merged.happies.map(h => h.id)).toEqual(['b'])
            expect(merged.deletions).toEqual([{ id: 'a', deletedAt: '2026-09-10T09:00:00.000Z' }])
        })

        it('keeps the tombstone so the next sync does not put it back', () => {
            // Without this, the device that still holds the copy sees an id the
            // pod does not have, reads it as "not uploaded yet", and re-uploads
            // the happy the user deleted.
            const local = month([], { deletions: [{ id: 'a', deletedAt: '2026-09-10T09:00:00.000Z' }] })
            const remote = month([happy('a')])

            const merged = mergeHappyMonths(local, remote)

            expect(merged.happies).toEqual([])
            expect(merged.deletions.map(d => d.id)).toEqual(['a'])
        })

        it('lets an edit made after the delete win, and drops the tombstone', () => {
            const local = month([happy('a', { text: 'edited after', lastModified: '2026-09-10T12:00:00.000Z' })])
            const remote = month([], { deletions: [{ id: 'a', deletedAt: '2026-09-10T09:00:00.000Z' }] })

            const merged = mergeHappyMonths(local, remote)

            expect(merged.happies.map(h => h.text)).toEqual(['edited after'])
            expect(merged.deletions).toEqual([])
        })

        it('keeps the later of two tombstones for the same happy', () => {
            const local = month([], { deletions: [{ id: 'a', deletedAt: '2026-09-10T09:00:00.000Z' }] })
            const remote = month([], { deletions: [{ id: 'a', deletedAt: '2026-09-10T11:00:00.000Z' }] })

            expect(mergeHappyMonths(local, remote).deletions)
                .toEqual([{ id: 'a', deletedAt: '2026-09-10T11:00:00.000Z' }])
        })
    })

    it('carries the later month-level timestamp', () => {
        const local = month([], { lastModified: '2026-09-10T10:00:00.000Z' })
        const remote = month([], { lastModified: '2026-09-10T11:00:00.000Z' })

        expect(mergeHappyMonths(local, remote).lastModified).toBe('2026-09-10T11:00:00.000Z')
    })

    it('never carries a _rev across, which belongs to one database', () => {
        const local = month([], { _rev: '3-local' })
        const remote = month([], { _rev: '7-remote' })

        expect(mergeHappyMonths(local, remote)._rev).toBeUndefined()
    })
})

describe('withHappy', () => {
    it('adds a new happy', () => {
        const result = withHappy(month([]), happy('a'))
        expect(result.happies.map(h => h.id)).toEqual(['a'])
    })

    it('replaces one with the same id rather than duplicating it', () => {
        const result = withHappy(month([happy('a')]), happy('a', { text: 'edited' }))
        expect(result.happies).toHaveLength(1)
        expect(result.happies[0].text).toBe('edited')
    })

    it('clears any tombstone for that id, so an edit is not re-deleted', () => {
        const start = month([], { deletions: [{ id: 'a', deletedAt: '2026-09-10T09:00:00.000Z' }] })
        const result = withHappy(start, happy('a'))
        expect(result.deletions).toEqual([])
    })
})

describe('withoutHappy', () => {
    it('removes the happy and records a tombstone', () => {
        const result = withoutHappy(month([happy('a'), happy('b')]), 'a', '2026-09-10T09:00:00.000Z')
        expect(result.happies.map(h => h.id)).toEqual(['b'])
        expect(result.deletions).toEqual([{ id: 'a', deletedAt: '2026-09-10T09:00:00.000Z' }])
    })

    it('is a no-op for an id that is not there, bar the tombstone', () => {
        const result = withoutHappy(month([happy('a')]), 'missing', '2026-09-10T09:00:00.000Z')
        expect(result.happies.map(h => h.id)).toEqual(['a'])
        expect(result.deletions.map(d => d.id)).toEqual(['missing'])
    })
})

describe('monthsEqual', () => {
    it('ignores _rev, which is per-database bookkeeping', () => {
        expect(monthsEqual(month([happy('a')], { _rev: '1-a' }), month([happy('a')], { _rev: '9-b' }))).toBe(true)
    })

    it('sees a differing happy', () => {
        expect(monthsEqual(month([happy('a')]), month([happy('a', { text: 'other' })]))).toBe(false)
    })

    it('ignores the order the object\'s keys happen to be in', () => {
        // A month read back from PouchDB has its keys in the order the stored
        // payload was built; one straight from a merge has them in the order
        // the merge writes them. Comparing by JSON.stringify made those two
        // unequal, and every sign-in re-uploaded months it had just decided
        // were already correct.
        const fromMerge: HappyMonth = { month: '2026-09', happies: [happy('a')], deletions: [], lastModified: '2026-09-10T10:00:00.000Z' }
        const fromDatabase = JSON.parse(JSON.stringify({
            lastModified: '2026-09-10T10:00:00.000Z',
            deletions: [],
            happies: [happy('a')],
            month: '2026-09',
        })) as HappyMonth

        expect(JSON.stringify(fromMerge)).not.toBe(JSON.stringify(fromDatabase))
        expect(monthsEqual(fromMerge, fromDatabase)).toBe(true)
    })

    it('ignores the order the happies arrive in', () => {
        const one = month([happy('a'), happy('b', { createdAt: '2026-09-10T09:00:00.000Z' })])
        const other = month([happy('b', { createdAt: '2026-09-10T09:00:00.000Z' }), happy('a')])

        expect(monthsEqual(one, other)).toBe(true)
    })

    it('treats an absent tag list and an empty one as the same', () => {
        // One comes off the wire (absent), the other out of an edit that
        // removed the last tag. Calling them different would write on every poll.
        expect(monthsEqual(
            month([happy('a', { tags: undefined })]),
            month([happy('a', { tags: [] })]),
        )).toBe(true)
    })

    it('sees a differing mood, tag or timestamp', () => {
        expect(monthsEqual(month([happy('a')]), month([happy('a', { mood: 3 })]))).toBe(false)
        expect(monthsEqual(month([happy('a', { tags: ['x'] })]), month([happy('a', { tags: ['y'] })]))).toBe(false)
        expect(monthsEqual(
            month([happy('a')]),
            month([happy('a', { lastModified: '2026-09-11T08:00:00.000Z' })]),
        )).toBe(false)
    })

    it('sees a differing tombstone', () => {
        expect(monthsEqual(
            month([], { deletions: [{ id: 'a', deletedAt: '2026-09-10T09:00:00.000Z' }] }),
            month([], { deletions: [{ id: 'a', deletedAt: '2026-09-10T11:00:00.000Z' }] }),
        )).toBe(false)
    })
})
