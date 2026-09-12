import { useEffect, useRef, useState } from 'react'
import { nextMilestone } from '../happies/streak'
import type { Streak } from '../happies/streak'

interface StreakBadgeProps {
    streak: Streak
}

/**
 * The streak, as one quiet line rather than a scoreboard.
 *
 * A streak is the only pressure this app applies, so how it is *worded* is as
 * load-bearing as how it is counted (see `computeStreak`):
 *
 * - **Nothing written today is never framed as a loss.** The run through
 *   yesterday still shows, and the note beside it says the day is still there
 *   to be had. "You broke your streak" at 9am is how somebody stops opening
 *   the app.
 * - **A broken streak says nothing at all about the streak.** When the count is
 *   zero the badge shows the longest run instead, because "0 days" is a
 *   reproach and "best: 23 days" is a fact.
 * - **The next milestone is only mentioned when it is close.** A "2 days to
 *   go" is an invitation; a permanent "363 days to 365" is a chore.
 */
export function StreakBadge({ streak }: StreakBadgeProps) {
    const { current, longest, writtenToday, atRisk } = streak
    const [isBumping, setIsBumping] = useState(false)
    const previousRef = useRef(current)

    // Only on an increase: re-rendering the page, or a sync that recounts the
    // same number, must not set the flame off again.
    useEffect(() => {
        if (current > previousRef.current && previousRef.current > 0) {
            setIsBumping(true)
            const timer = setTimeout(() => setIsBumping(false), 500)
            previousRef.current = current
            return () => clearTimeout(timer)
        }
        previousRef.current = current
    }, [current])

    if (current === 0) {
        if (longest === 0) return null
        return (
            <p data-testid="streak-badge" className="text-sm text-gray-600 dark:text-gray-400">
                <span aria-hidden="true">🔥 </span>
                Your best run so far was{' '}
                <strong className="font-bold text-gray-800 dark:text-gray-200">{longest} days</strong>.
                Today is a good day to start another.
            </p>
        )
    }

    const upcoming = nextMilestone(current)
    const toGo = upcoming !== undefined ? upcoming - current : undefined
    const milestoneIsClose = toGo !== undefined && toGo <= 3

    return (
        <p data-testid="streak-badge" className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="inline-flex items-baseline gap-1.5 font-bold text-secondary-700 dark:text-secondary-300">
                <span aria-hidden="true" className={isBumping ? 'streak-bumping inline-block' : 'inline-block'}>🔥</span>
                {current} day{current === 1 ? '' : 's'} in a row
            </span>
            {atRisk ? (
                <span className="text-gray-600 dark:text-gray-400">
                    — still going. Add today's whenever you like.
                </span>
            ) : milestoneIsClose ? (
                <span className="text-gray-600 dark:text-gray-400">
                    — {toGo} more to reach {upcoming}.
                </span>
            ) : (
                writtenToday && (
                    <span className="text-gray-600 dark:text-gray-400">— today is in the bag.</span>
                )
            )}
        </p>
    )
}
