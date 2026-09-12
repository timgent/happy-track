import { Link } from 'react-router-dom'
import { ClockIcon } from '@heroicons/react/24/outline'
import { formatDayHeading, monthKeyOf, parseDateKey } from '../happies/dates'
import { moodFor } from '../happies/types'
import type { Happy } from '../happies/types'

interface OnThisDayCardProps {
    /** The resurfaced happies, most recent year first. */
    happies: Happy[]
    /** Today, so "a year ago" can be worked out. */
    today: string
}

/** "A year ago" / "2 years ago" — the interval, not the date. */
function yearsAgo(dateKey: string, today: string): string {
    const years = parseDateKey(today).getFullYear() - parseDateKey(dateKey).getFullYear()
    if (years <= 0) return formatDayHeading(dateKey, today)
    return years === 1 ? 'A year ago today' : `${years} years ago today`
}

/**
 * A happy from this same day in an earlier year.
 *
 * The one feature here that needs no new data and no configuration, and the one
 * people tend to like most: a journal is worth keeping because of what it is
 * like to read, and this is the app doing the re-reading for you.
 *
 * Deliberately below the composer, and deliberately quiet. It is a gift, not a
 * task — putting it above today's box would make the app about the past when
 * the thing it wants from you is one line about now.
 */
export function OnThisDayCard({ happies, today }: OnThisDayCardProps) {
    if (happies.length === 0) return null

    return (
        <section
            data-testid="on-this-day"
            aria-labelledby="on-this-day-heading"
            className="rounded-2xl border border-accent-200 dark:border-accent-900 bg-accent-50/60 dark:bg-accent-950/30 p-4 sm:p-5"
        >
            <h2
                id="on-this-day-heading"
                className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-accent-800 dark:text-accent-200"
            >
                <ClockIcon aria-hidden="true" className="h-4 w-4" />
                On this day
            </h2>

            <ul className="mt-3 space-y-3">
                {happies.map(happy => {
                    const mood = moodFor(happy.mood)
                    return (
                        <li key={happy.id}>
                            <p className="text-xs font-semibold text-accent-700 dark:text-accent-300">
                                {yearsAgo(happy.date, today)}
                            </p>
                            <p className="mt-0.5 flex items-start gap-2 text-base leading-7 text-gray-800 dark:text-gray-200">
                                {mood && (
                                    <span className="shrink-0 leading-7" role="img" aria-label={mood.label}>
                                        {mood.emoji}
                                    </span>
                                )}
                                <span className="min-w-0 whitespace-pre-wrap break-words">{happy.text}</span>
                            </p>
                            <Link
                                to={`/journal/${monthKeyOf(happy.date)}`}
                                className="mt-1 inline-block text-xs font-semibold text-accent-700 dark:text-accent-300 underline hover:no-underline"
                            >
                                See that month
                            </Link>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}
