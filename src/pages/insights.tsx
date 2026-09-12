import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useHappies } from '../hooks/useHappies'
import { LoadingState } from '../components/LoadingState'
import { PodSyncIndicator } from '../components/PodSyncIndicator'
import { BarChart, ColumnChart, EmphasisColumnChart, StatTile } from '../components/Charts'
import { Callout } from '../components/Callout'
import { computeStreak } from '../happies/streak'
import { journalInsights } from '../happies/insights'
import { formatDayHeading, thisMonthKey, todayKey } from '../happies/dates'

/** How many tags the chart shows before the tail is left to the table. */
const TOP_TAGS = 8

/**
 * How many happies a figure needs behind it before it is worth stating.
 *
 * An average mood from three entries is noise wearing a number, and a "your
 * happiest day is Tuesday" drawn from one Tuesday is worse than saying nothing:
 * it is a claim the reader will remember and it is not true.
 */
const MIN_FOR_A_CLAIM = 10

export function InsightsPage() {
    const navigate = useNavigate()
    const today = todayKey()
    const currentMonth = thisMonthKey()
    const { months, writtenDays, isLoading, isCheckingPod } = useHappies()

    const insights = useMemo(
        () => journalInsights(months, currentMonth, today),
        [months, currentMonth, today],
    )
    const streak = useMemo(() => computeStreak(writtenDays, today), [writtenDays, today])

    if (isLoading) {
        return <LoadingState message="Adding up your happies…" rows={2} />
    }

    if (insights.totalHappies === 0) {
        return (
            <div className="mx-auto max-w-2xl">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 sm:text-3xl">Insights</h1>
                {isCheckingPod && <div className="mt-4"><PodSyncIndicator /></div>}
                <div className="mt-4">
                    <Callout
                        title="Nothing to add up yet"
                        description={
                            <>
                                <p>
                                    Write a happy or two and this page starts showing you the shape of
                                    them — when you write, what you tag, how it felt.
                                </p>
                                <p className="mt-2">
                                    <Link to="/today" className="font-semibold underline hover:no-underline">
                                        Write today's happy
                                    </Link>
                                </p>
                            </>
                        }
                    />
                </div>
            </div>
        )
    }

    const enoughForClaims = insights.totalHappies >= MIN_FOR_A_CLAIM

    return (
        <div className="mx-auto max-w-3xl">
            <header className="mb-5">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 sm:text-3xl">Insights</h1>
                {insights.firstDay && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {/* "Since Today." is not a sentence — and on the first
                            day there is no "since" to speak of. */}
                        {insights.firstDay === today
                            ? 'Started today.'
                            : `Since ${formatDayHeading(insights.firstDay, today)}.`}
                    </p>
                )}
            </header>

            {isCheckingPod && <PodSyncIndicator />}

            {/* Stat tiles, not charts: each is a single current value with no
                comparison to make. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile value={insights.totalHappies} label="Happies" />
                <StatTile
                    value={insights.daysWritten}
                    label="Days written"
                    // The denominator as a plain count, not a percentage. "2%
                    // of days" reads as a grade on a journal somebody is doing
                    // fine at; "of 366" is the same arithmetic without the
                    // verdict, and this page is not here to mark anyone.
                    note={`of ${insights.daysSinceFirst}`}
                />
                <StatTile
                    value={streak.current}
                    label="Day streak"
                    note={streak.atRisk ? 'Today still to go' : undefined}
                />
                <StatTile value={streak.longest} label="Best streak" />
            </div>

            <div className="mt-6 space-y-4">
                {insights.happiesPerMonth.length > 1 && (
                    <ColumnChart
                        heading="Month by month"
                        caption="How many happies you wrote in each month, the quiet ones included."
                        data={insights.happiesPerMonth.map(month => ({
                            label: month.label,
                            shortLabel: month.shortLabel,
                            title: month.label,
                            value: month.count,
                        }))}
                    />
                )}

                {enoughForClaims && (
                    <EmphasisColumnChart
                        heading="Days of the week"
                        caption="Which days you tend to write on. The tallest is highlighted."
                        data={insights.weekdayCounts.map(day => ({
                            label: day.label,
                            shortLabel: day.label,
                            title: day.label,
                            value: day.count,
                        }))}
                    />
                )}

                {insights.moodedHappies > 0 && (
                    <BarChart
                        heading="How it felt"
                        caption={
                            insights.moodedHappies === insights.totalHappies
                                ? 'Every happy you have given a mood.'
                                : `Of the ${insights.moodedHappies} happies you gave a mood to.`
                        }
                        data={insights.moodCounts.map(mood => ({
                            label: `${mood.emoji} ${mood.label}`,
                            title: mood.label,
                            value: mood.count,
                        }))}
                    />
                )}

                {insights.topTags.length > 0 && (
                    <BarChart
                        heading="Your tags"
                        caption={
                            insights.topTags.length > TOP_TAGS
                                ? `The ${TOP_TAGS} you use most. Pick one to see those happies.`
                                : 'Pick one to see those happies.'
                        }
                        valueHeading="Happies"
                        data={insights.topTags.slice(0, TOP_TAGS).map(tag => ({
                            label: tag.tag,
                            value: tag.count,
                        }))}
                        onSelect={datum => navigate(`/journal?tag=${encodeURIComponent(datum.label)}`)}
                    />
                )}
            </div>

            {!enoughForClaims && (
                <p className="mt-5 text-center text-sm text-gray-600 dark:text-gray-400">
                    A few more happies and there will be patterns worth showing here.
                </p>
            )}
        </div>
    )
}
