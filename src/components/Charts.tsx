import { useId, useState } from 'react'

/**
 * The journal's charts.
 *
 * Built as plain HTML and inline SVG rather than with a charting library: every
 * one of them is a single series of counts, which is a `<div>` with a width.
 * A library would be more code, more bundle and less control over the specs
 * below.
 *
 * Those specs are the reason these live in one file rather than being inlined
 * where they are used — they have to agree with each other:
 *
 * - **One hue per chart, one step.** Every chart here plots one series, so
 *   colour carries no information and re-using it to restate the bar's own
 *   length would spend the identity channel on nothing. The marks use the
 *   primary series colour throughout; the only chart with two colours is the
 *   weekday one, where the *emphasis* (best day vs the rest) is the point.
 * - **Both steps clear 3:1 on their surface.** `#d97706` is 3.19:1 on white and
 *   `#f59e0b` is 8.26:1 on the dark card. `#f59e0b` on white is 2.15:1, which
 *   is why the light mode does not use it.
 * - **≤24px thick, 4px rounded at the data end, square at the baseline**, with
 *   a 2px surface gap between neighbours, so adjacent bars are separated by
 *   surface rather than by a stroke.
 * - **Labels are selective.** The value rides the extreme and the hovered mark;
 *   the rest are in the table every chart ships with. A number on every bar is
 *   chaos and goes unread.
 * - **Every chart has a table.** It is the accessible equivalent and the
 *   fallback for anyone the colour does not work for — and it is what makes a
 *   sub-3:1 de-emphasis gray legal in the weekday chart.
 */

/** The series colour, as CSS that follows the theme. See the note above. */
const SERIES = 'bg-primary-600 dark:bg-primary-500'
/** De-emphasised context marks. Sub-3:1 by design; the table carries the values. */
const DE_EMPHASIS = 'bg-gray-300 dark:bg-gray-600'

export interface ChartDatum {
    /** The category — a month, a weekday, a tag. */
    label: string
    value: number
    /** Longer form for the tooltip and the table, when `label` is abbreviated. */
    title?: string
    /**
     * What goes under the bar when the full label will not fit.
     *
     * Supplied by the caller rather than truncated here, because truncation
     * cannot know what makes a label distinct: cutting "September 2025" and
     * "September" to three characters gives two bars a year apart the same
     * label, "Sep".
     */
    shortLabel?: string
}

interface ChartFrameProps {
    heading: string
    /** What the reader is looking at, in a sentence. Doubles as the chart's own label. */
    caption: string
    children: React.ReactNode
    data: ChartDatum[]
    /** What the value column is called in the table. */
    valueHeading?: string
}

/**
 * Heading, caption, the marks, and the table behind a disclosure.
 *
 * The table is a `<details>` rather than a separate tab: it is a fallback, so
 * it should cost nothing to ignore and one click to reach.
 */
function ChartFrame({ heading, caption, children, data, valueHeading = 'Happies' }: ChartFrameProps) {
    const tableId = useId()

    return (
        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-soft sm:p-5">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-50">{heading}</h3>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{caption}</p>
            <div className="mt-4">{children}</div>

            <details className="mt-4 group">
                <summary className="cursor-pointer list-none text-xs font-semibold text-gray-600 dark:text-gray-400 marker:content-none">
                    <span className="group-open:hidden">▸ </span>
                    <span className="hidden group-open:inline">▾ </span>
                    See the numbers
                </summary>
                <table id={tableId} className="mt-2 w-full text-sm">
                    <caption className="sr-only">{caption}</caption>
                    <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                            <th scope="col" className="py-1 font-semibold text-gray-700 dark:text-gray-300">{heading}</th>
                            <th scope="col" className="py-1 text-right font-semibold text-gray-700 dark:text-gray-300">{valueHeading}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map(datum => (
                            <tr key={datum.label} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                                <th scope="row" className="py-1 font-normal text-gray-700 dark:text-gray-300">
                                    {datum.title ?? datum.label}
                                </th>
                                <td className="py-1 text-right tabular-nums text-gray-900 dark:text-gray-100">{datum.value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </details>
        </section>
    )
}

/**
 * Counts over time, as columns.
 *
 * The axis is the labels under the bars; there are no gridlines, because the
 * reader's question here is "which months were fuller", not "was August exactly
 * 17". The exact numbers are one click away in the table, and the tallest month
 * is direct-labelled.
 */
export function ColumnChart({ heading, caption, data }: { heading: string; caption: string; data: ChartDatum[] }) {
    const [hovered, setHovered] = useState<string | null>(null)
    const max = Math.max(1, ...data.map(datum => datum.value))
    const peak = data.reduce<ChartDatum | null>(
        (best, datum) => (best === null || datum.value > best.value ? datum : best),
        null,
    )
    // Past a dozen or so columns the labels cannot all fit, so every other one
    // is dropped rather than allowed to overlap.
    const labelEvery = data.length > 14 ? Math.ceil(data.length / 8) : 1

    return (
        <ChartFrame heading={heading} caption={caption} data={data}>
            {/* gap-0.5 is the 2px surface gap: neighbours are separated by
                surface, never by a stroke. */}
            <div className="flex h-40 items-end gap-0.5" role="presentation">
                {data.map((datum, index) => {
                    const isHovered = hovered === datum.label
                    const isPeak = peak !== null && datum.label === peak.label && datum.value > 0
                    return (
                        <div
                            key={datum.label}
                            className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
                            onMouseEnter={() => setHovered(datum.label)}
                            onMouseLeave={() => setHovered(null)}
                            onFocus={() => setHovered(datum.label)}
                            onBlur={() => setHovered(null)}
                            tabIndex={0}
                            // The whole column is one thing to a screen reader:
                            // the label and its value, read together.
                            aria-label={`${datum.title ?? datum.label}: ${datum.value}`}
                        >
                            {(isHovered || isPeak) && (
                                <span
                                    aria-hidden="true"
                                    className="mb-1 text-center text-xs font-bold tabular-nums text-gray-700 dark:text-gray-300"
                                >
                                    {datum.value}
                                </span>
                            )}
                            <div
                                aria-hidden="true"
                                // 4px rounded at the data end, square at the baseline.
                                className={`chart-bar-grow mx-auto w-full max-w-6 rounded-t ${isHovered ? 'bg-primary-700 dark:bg-primary-400' : SERIES}`}
                                // A written-in month never renders as nothing:
                                // a 3px stub says "one" where 0px says "none".
                                style={{ height: datum.value === 0 ? '0' : `max(3px, ${(datum.value / max) * 100}%)` }}
                            />
                            {index % labelEvery === 0 && (
                                <span
                                    aria-hidden="true"
                                    className="mt-1.5 truncate text-center text-[10px] font-medium text-gray-500 dark:text-gray-400"
                                >
                                    {datum.shortLabel ?? datum.label}
                                </span>
                            )}
                        </div>
                    )
                })}
            </div>
        </ChartFrame>
    )
}

/**
 * Counts across a handful of named things, as horizontal bars.
 *
 * Horizontal because the labels are words — tags, moods — and a word under a
 * column has to be rotated or truncated to fit. Every value is labelled here
 * rather than selectively: there are at most a few rows, the label sits in the
 * space beside the bar that would otherwise be empty, and at this density the
 * numbers do not compete.
 */
export function BarChart({
    heading,
    caption,
    data,
    valueHeading,
    onSelect,
}: {
    heading: string
    caption: string
    data: ChartDatum[]
    valueHeading?: string
    /** Makes each row a button — used to filter the journal by tag. */
    onSelect?: (datum: ChartDatum) => void
}) {
    const max = Math.max(1, ...data.map(datum => datum.value))

    return (
        <ChartFrame heading={heading} caption={caption} data={data} valueHeading={valueHeading}>
            <ul className="space-y-2">
                {data.map(datum => {
                    /*
                     * Label above the bar on a phone, beside it from `sm` up.
                     *
                     * A fixed label column narrow enough to leave room for the
                     * bar at 390px is too narrow for the labels themselves —
                     * "Over the moon" and a tag of any length both arrive as
                     * "Over th…", which is the one thing a label must not do.
                     * Stacking gives the label the full width and the bar the
                     * full width, and reads better at that size anyway.
                     */
                    const row = (
                        <>
                            <span
                                className="text-sm text-gray-700 dark:text-gray-300 sm:w-28 sm:shrink-0 sm:truncate"
                                title={datum.title ?? datum.label}
                            >
                                {datum.label}
                            </span>
                            <span aria-hidden="true" className="flex min-w-0 flex-1 items-center gap-2">
                                <span
                                    className={`chart-bar-grow h-4 rounded-r ${SERIES}`}
                                    style={{ width: datum.value === 0 ? '0' : `max(3px, ${(datum.value / max) * 100}%)` }}
                                />
                                <span className="shrink-0 text-xs font-bold tabular-nums text-gray-600 dark:text-gray-400">
                                    {datum.value}
                                </span>
                            </span>
                        </>
                    )

                    return (
                        <li key={datum.label}>
                            {onSelect ? (
                                <button
                                    type="button"
                                    onClick={() => onSelect(datum)}
                                    aria-label={`${datum.title ?? datum.label}: ${datum.value}. Show these in the journal.`}
                                    className="flex min-h-11 w-full flex-col gap-1 rounded-lg px-1 py-1 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 sm:flex-row sm:items-center sm:gap-3 sm:py-0"
                                >
                                    {row}
                                </button>
                            ) : (
                                <div
                                    className="flex min-h-9 flex-col gap-1 px-1 py-1 sm:flex-row sm:items-center sm:gap-3 sm:py-0"
                                    aria-label={`${datum.title ?? datum.label}: ${datum.value}`}
                                >
                                    {row}
                                </div>
                            )}
                        </li>
                    )
                })}
            </ul>
        </ChartFrame>
    )
}

/**
 * Columns where one of them is the story.
 *
 * The *emphasis* form: the busiest day in the series colour, the rest in the
 * de-emphasis gray. That gray is deliberately sub-3:1 — it is context, not
 * data — which is legal precisely because every column is direct-labelled and
 * the table is there.
 */
export function EmphasisColumnChart({
    heading,
    caption,
    data,
}: {
    heading: string
    caption: string
    data: ChartDatum[]
}) {
    const max = Math.max(1, ...data.map(datum => datum.value))
    const peakValue = Math.max(...data.map(datum => datum.value))
    // Nothing to emphasise when nothing has been written, or when every day is
    // level — highlighting an arbitrary one of seven equal days would be a lie.
    const hasPeak = peakValue > 0 && data.filter(datum => datum.value === peakValue).length < data.length

    return (
        <ChartFrame heading={heading} caption={caption} data={data}>
            <div className="flex h-32 items-end gap-1" role="presentation">
                {data.map(datum => {
                    const isPeak = hasPeak && datum.value === peakValue
                    return (
                        <div
                            key={datum.label}
                            className="flex h-full min-w-0 flex-1 flex-col justify-end"
                            aria-label={`${datum.title ?? datum.label}: ${datum.value}`}
                        >
                            <span
                                aria-hidden="true"
                                className={`mb-1 text-center text-xs tabular-nums ${isPeak ? 'font-bold text-primary-800 dark:text-primary-300' : 'font-medium text-gray-500 dark:text-gray-400'}`}
                            >
                                {datum.value}
                            </span>
                            <div
                                aria-hidden="true"
                                className={`chart-bar-grow mx-auto w-full max-w-6 rounded-t ${isPeak ? SERIES : DE_EMPHASIS}`}
                                style={{ height: datum.value === 0 ? '0' : `max(3px, ${(datum.value / max) * 100}%)` }}
                            />
                            <span
                                aria-hidden="true"
                                className={`mt-1.5 text-center text-[10px] ${isPeak ? 'font-bold text-gray-800 dark:text-gray-200' : 'font-medium text-gray-500 dark:text-gray-400'}`}
                            >
                                {datum.label}
                            </span>
                        </div>
                    )
                })}
            </div>
        </ChartFrame>
    )
}

/**
 * One headline number.
 *
 * A stat tile, not a one-bar chart: a single current value has no comparison to
 * make, so a bar would be a rectangle whose length means nothing.
 */
export function StatTile({ value, label, note }: { value: string | number; label: string; note?: string }) {
    return (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-soft">
            <p className="text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-50">{value}</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</p>
            {note && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{note}</p>}
        </div>
    )
}
