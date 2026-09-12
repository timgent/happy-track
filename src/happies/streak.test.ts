import { describe, expect, it } from 'vitest'
import { computeStreak, nextMilestone, MILESTONES, isMilestone } from './streak'

/** A set of date keys, the shape `computeStreak` takes. */
const days = (...keys: string[]) => new Set(keys)

describe('computeStreak', () => {
    it('is zero with nothing written', () => {
        expect(computeStreak(days(), '2026-09-10')).toEqual({
            current: 0,
            longest: 0,
            writtenToday: false,
            atRisk: false,
        })
    })

    it('counts one for a single happy written today', () => {
        const streak = computeStreak(days('2026-09-10'), '2026-09-10')
        expect(streak.current).toBe(1)
        expect(streak.writtenToday).toBe(true)
        expect(streak.atRisk).toBe(false)
    })

    it('counts consecutive days ending today', () => {
        const streak = computeStreak(days('2026-09-08', '2026-09-09', '2026-09-10'), '2026-09-10')
        expect(streak.current).toBe(3)
    })

    it('keeps the streak alive on a day not yet written, and flags it at risk', () => {
        // Being asked at 9am whether you have "lost" a streak you are still
        // able to keep is the fastest way to make someone give up on it. The
        // run through yesterday still counts; `atRisk` is what the UI nudges on.
        const streak = computeStreak(days('2026-09-08', '2026-09-09'), '2026-09-10')
        expect(streak.current).toBe(2)
        expect(streak.writtenToday).toBe(false)
        expect(streak.atRisk).toBe(true)
    })

    it('breaks once a whole day has been missed', () => {
        const streak = computeStreak(days('2026-09-07', '2026-09-08'), '2026-09-10')
        expect(streak.current).toBe(0)
        expect(streak.atRisk).toBe(false)
    })

    it('crosses a month boundary', () => {
        const streak = computeStreak(days('2026-08-30', '2026-08-31', '2026-09-01'), '2026-09-01')
        expect(streak.current).toBe(3)
    })

    it('ignores days in the future', () => {
        // A device with a fast clock, or a happy backdated by hand, must not
        // inflate the streak past today.
        const streak = computeStreak(days('2026-09-10', '2026-09-11'), '2026-09-10')
        expect(streak.current).toBe(1)
    })

    it('counts several happies on one day as one day', () => {
        // The set is of days, not entries — three happies on Tuesday is still
        // one day of the streak. This pins the contract for callers.
        const streak = computeStreak(days('2026-09-10'), '2026-09-10')
        expect(streak.current).toBe(1)
    })

    describe('longest', () => {
        it('remembers a run that has since been broken', () => {
            const streak = computeStreak(
                days('2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-10'),
                '2026-09-10',
            )
            expect(streak.current).toBe(1)
            expect(streak.longest).toBe(4)
        })

        it('is at least the current streak', () => {
            const streak = computeStreak(days('2026-09-09', '2026-09-10'), '2026-09-10')
            expect(streak.longest).toBe(2)
        })

        it('finds the longest of several runs', () => {
            const streak = computeStreak(
                days('2026-01-01', '2026-01-02', '2026-05-01', '2026-05-02', '2026-05-03'),
                '2026-09-10',
            )
            expect(streak.longest).toBe(3)
        })
    })
})

describe('nextMilestone', () => {
    it('points at the first milestone above the current streak', () => {
        expect(nextMilestone(1)).toBe(3)
        expect(nextMilestone(3)).toBe(7)
        expect(nextMilestone(10)).toBe(14)
    })

    it('has nothing left to offer past the last one', () => {
        expect(nextMilestone(MILESTONES[MILESTONES.length - 1])).toBeUndefined()
    })
})

describe('isMilestone', () => {
    it('recognises the milestones and nothing else', () => {
        expect(isMilestone(7)).toBe(true)
        expect(isMilestone(8)).toBe(false)
        expect(isMilestone(0)).toBe(false)
    })
})
