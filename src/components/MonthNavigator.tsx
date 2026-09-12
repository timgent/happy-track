import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { formatMonthHeading, nextMonthKey, previousMonthKey, thisMonthKey } from '../happies/dates'

interface MonthNavigatorProps {
    month: string
    onChange: (month: string) => void
    /** The earliest month with anything in it; back stops there. */
    earliestMonth?: string
    /** Which days of this month have happies, for the dot strip. */
    writtenDays: ReadonlySet<string>
}

/** Days in a month, from its key. Day 0 of the next month is the last of this one. */
function daysInMonth(monthKey: string): number {
    const [year, month] = monthKey.split('-').map(Number)
    return new Date(year, month, 0).getDate()
}

/**
 * Which month the journal is showing, and a glance at how full it was.
 *
 * The dot strip under the arrows is the part worth defending: it answers "how
 * did this month go" before a single entry has been read, and it makes the gaps
 * visible without ever saying the word "missed". It is decorative on purpose —
 * the entries themselves are below it, and a screen reader gets the count in
 * words instead of thirty announcements.
 *
 * Forward is disabled at the current month rather than hidden. A control that
 * disappears at the edge of its range leaves the reader wondering whether they
 * did something wrong; one that is plainly unavailable does not.
 */
export function MonthNavigator({ month, onChange, earliestMonth, writtenDays }: MonthNavigatorProps) {
    const currentMonth = thisMonthKey()
    const canGoBack = earliestMonth === undefined || month > earliestMonth
    const canGoForward = month < currentMonth

    const days = Array.from({ length: daysInMonth(month) }, (_, index) => {
        const day = String(index + 1).padStart(2, '0')
        return { day: index + 1, written: writtenDays.has(`${month}-${day}`) }
    })
    const writtenCount = days.filter(day => day.written).length

    return (
        <div>
            <div className="flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => onChange(previousMonthKey(month))}
                    disabled={!canGoBack}
                    aria-label={`Show ${formatMonthHeading(previousMonthKey(month), currentMonth)}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                    <ChevronLeftIcon aria-hidden="true" className="h-5 w-5" />
                </button>

                {/* aria-live, so arrowing through the months announces where you
                    have landed rather than silently redrawing the page. */}
                <h2 aria-live="polite" className="min-w-0 flex-1 text-center text-xl font-bold text-gray-900 dark:text-gray-50">
                    {formatMonthHeading(month, currentMonth)}
                </h2>

                <button
                    type="button"
                    onClick={() => onChange(nextMonthKey(month))}
                    disabled={!canGoForward}
                    aria-label={`Show ${formatMonthHeading(nextMonthKey(month), currentMonth)}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                    <ChevronRightIcon aria-hidden="true" className="h-5 w-5" />
                </button>
            </div>

            <div className="mt-2.5 flex items-center gap-2">
                <div aria-hidden="true" className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {days.map(day => (
                        <span
                            key={day.day}
                            title={`${day.day} ${formatMonthHeading(month, currentMonth)}`}
                            className={`h-2 w-2 rounded-full ${
                                day.written
                                    ? 'bg-primary-500 dark:bg-primary-400'
                                    : 'bg-gray-200 dark:bg-gray-700'
                            }`}
                        />
                    ))}
                </div>
                <p className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                    {writtenCount} of {days.length} days
                </p>
            </div>
        </div>
    )
}
