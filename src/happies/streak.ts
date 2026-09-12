import { addDays, daysBetween } from './dates'

/**
 * How many days in a row you have written something.
 *
 * A streak is the one bit of gentle pressure this app applies, so the rules
 * matter more than the number does:
 *
 * - **A day you have not written yet does not break it.** The run through
 *   yesterday still counts, and `atRisk` says the day is unclaimed. Telling
 *   someone at 9am that they have lost a 40-day streak they could still keep by
 *   lunchtime is how you get them to stop opening the app.
 * - **Missing a whole day does break it**, and the number says 0 rather than
 *   pretending. `longest` is kept alongside precisely so the broken run is not
 *   simply erased — the 40 days happened.
 * - **Several happies in one day is one day.** The input is a set of days.
 */
export interface Streak {
    /** Days in the current unbroken run, counting a run that ends yesterday. */
    current: number
    /** The longest run ever recorded, current one included. */
    longest: number
    /** Whether today already has a happy in it. */
    writtenToday: boolean
    /** A live streak with nothing written today yet — the day is still winnable. */
    atRisk: boolean
}

/**
 * Streak lengths worth marking. Close together at the start, where the habit is
 * actually formed and a fortnight feels impossibly far off, then spreading out.
 */
export const MILESTONES: readonly number[] = [3, 7, 14, 30, 50, 100, 200, 365, 500, 1000] as const

export function isMilestone(streak: number): boolean {
    return MILESTONES.includes(streak)
}

/** The next milestone above `streak`, or undefined past the last one. */
export function nextMilestone(streak: number): number | undefined {
    return MILESTONES.find(milestone => milestone > streak)
}

/**
 * @param writtenDays every day that has at least one happy, as date keys
 * @param today       today's date key, injected so this is testable and so a
 *                    page rendered across midnight can be told to re-derive
 */
export function computeStreak(writtenDays: ReadonlySet<string>, today: string): Streak {
    // A clock running fast, or a happy deliberately backdated into tomorrow,
    // must not be able to count towards a streak that has not happened yet.
    const days = [...writtenDays].filter(day => day <= today).sort()
    if (days.length === 0) {
        return { current: 0, longest: 0, writtenToday: false, atRisk: false }
    }

    const written = new Set(days)
    const writtenToday = written.has(today)

    // Count back from today when today is claimed, and from yesterday when it
    // is not — that is the "a day in hand" rule above.
    const runEndsAt = writtenToday ? today : addDays(today, -1)
    let current = 0
    if (written.has(runEndsAt)) {
        let cursor = runEndsAt
        while (written.has(cursor)) {
            current++
            cursor = addDays(cursor, -1)
        }
    }

    // One pass over the sorted days: a gap of exactly one day continues a run.
    let longest = 0
    let run = 0
    let previous: string | undefined
    for (const day of days) {
        run = previous !== undefined && daysBetween(previous, day) === 1 ? run + 1 : 1
        if (run > longest) longest = run
        previous = day
    }

    return {
        current,
        longest: Math.max(longest, current),
        writtenToday,
        atRisk: current > 0 && !writtenToday,
    }
}
