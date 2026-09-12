import type { Happy, HappyMonth, MoodValue } from './types'
import { MOODS } from './types'
import { formatMonthHeading, formatShortMonth, monthKeysBetween, parseDateKey } from './dates'

/**
 * What the journal adds up to.
 *
 * Everything here is derived from the months on the device, every time it is
 * asked — nothing is cached or stored. That is a deliberate trade: a stored
 * total is one more thing that can disagree with the data, and this walks a
 * few thousand entries in well under a frame. A journal is one small document
 * per month, so "all of it" is a cheap read.
 *
 * The counts are all honest about small numbers. An average mood computed from
 * two entries is not an insight, so the page is given the count alongside every
 * figure and can decide what to show.
 */

export interface TagCount {
    tag: string
    count: number
}

export interface MonthCount {
    month: string
    /** `formatMonthHeading` applied, so the chart does not re-derive it. */
    label: string
    /** The axis form — distinct across years, unlike a truncated `label`. */
    shortLabel: string
    count: number
}

export interface MoodCount {
    mood: MoodValue
    emoji: string
    label: string
    count: number
}

export interface WeekdayCount {
    /** 0 = Sunday, matching `Date.getDay()`. */
    weekday: number
    label: string
    count: number
}

export interface JournalInsights {
    /** Every happy ever written. */
    totalHappies: number
    /** Days with at least one — never more than `totalHappies`. */
    daysWritten: number
    /** Days from the first happy to today, inclusive. The denominator. */
    daysSinceFirst: number
    /** The first day anything was written, or undefined for an empty journal. */
    firstDay?: string
    happiesPerMonth: MonthCount[]
    moodCounts: MoodCount[]
    /** How many happies carry a mood at all — the denominator for the above. */
    moodedHappies: number
    weekdayCounts: WeekdayCount[]
    topTags: TagCount[]
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Every happy in these months, flattened. */
export function allHappies(months: readonly HappyMonth[]): Happy[] {
    return months.flatMap(month => month.happies)
}

/**
 * Tags by how often they are used, most-used first.
 *
 * Ties break alphabetically rather than by insertion order, so the list is
 * stable across reloads — a "top tags" list that reshuffles itself between
 * visits reads as broken even when the numbers are right.
 */
export function tagCounts(months: readonly HappyMonth[]): TagCount[] {
    const counts = new Map<string, number>()
    for (const happy of allHappies(months)) {
        for (const tag of happy.tags ?? []) {
            counts.set(tag, (counts.get(tag) ?? 0) + 1)
        }
    }
    return [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => (b.count - a.count) || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
}

/**
 * Happies per month, including the months with none.
 *
 * The gaps are the point: a bar chart that silently skips empty months claims
 * a run of activity that did not happen. The range runs from the first month
 * written to the month asked for (today's, normally), so the chart always ends
 * at the present.
 */
export function happiesPerMonth(
    months: readonly HappyMonth[],
    currentMonth: string,
): MonthCount[] {
    const written = months.filter(month => month.happies.length > 0)
    if (written.length === 0) return []

    const countsByMonth = new Map(written.map(month => [month.month, month.happies.length]))
    const firstMonth = written[0].month
    // A device with a clock behind its own data would otherwise produce an
    // empty range and a blank chart.
    const lastMonth = currentMonth > firstMonth ? currentMonth : firstMonth

    return monthKeysBetween(firstMonth, lastMonth).map(month => ({
        month,
        label: formatMonthHeading(month, currentMonth),
        shortLabel: formatShortMonth(month, currentMonth),
        count: countsByMonth.get(month) ?? 0,
    }))
}

/** How many happies carry each mood, in scale order. */
export function moodCounts(months: readonly HappyMonth[]): MoodCount[] {
    const counts = new Map<MoodValue, number>()
    for (const happy of allHappies(months)) {
        if (happy.mood !== undefined) {
            counts.set(happy.mood, (counts.get(happy.mood) ?? 0) + 1)
        }
    }
    return MOODS.map(mood => ({
        mood: mood.value,
        emoji: mood.emoji,
        label: mood.label,
        count: counts.get(mood.value) ?? 0,
    }))
}

/**
 * Happies per day of the week, Monday first.
 *
 * Monday first rather than Sunday: the weekend reading as two adjacent columns
 * is most of what makes this chart worth looking at.
 */
export function weekdayCounts(months: readonly HappyMonth[]): WeekdayCount[] {
    const counts = new Map<number, number>()
    for (const happy of allHappies(months)) {
        try {
            const weekday = parseDateKey(happy.date).getDay()
            counts.set(weekday, (counts.get(weekday) ?? 0) + 1)
        } catch {
            // A date that will not parse is a document written by something
            // else; skipping it is better than a NaN column.
        }
    }
    const mondayFirst = [1, 2, 3, 4, 5, 6, 0]
    return mondayFirst.map(weekday => ({
        weekday,
        label: WEEKDAY_LABELS[weekday],
        count: counts.get(weekday) ?? 0,
    }))
}

export function journalInsights(
    months: readonly HappyMonth[],
    currentMonth: string,
    today: string,
): JournalInsights {
    const happies = allHappies(months)
    const days = new Set(happies.map(happy => happy.date))
    const sortedDays = [...days].sort()
    const firstDay = sortedDays[0]

    const moods = moodCounts(months)

    return {
        totalHappies: happies.length,
        daysWritten: days.size,
        daysSinceFirst: firstDay ? daysInclusive(firstDay, today) : 0,
        ...(firstDay ? { firstDay } : {}),
        happiesPerMonth: happiesPerMonth(months, currentMonth),
        moodCounts: moods,
        moodedHappies: moods.reduce((total, mood) => total + mood.count, 0),
        weekdayCounts: weekdayCounts(months),
        topTags: tagCounts(months),
    }
}

/**
 * Calendar days from `from` to `to`, counting both ends.
 *
 * Local, rather than reaching for `daysBetween`, because the "+1" is what makes
 * it the denominator the page wants: writing on the first day of a one-day-old
 * journal is 1 day out of 1, not 1 out of 0.
 */
function daysInclusive(from: string, to: string): number {
    const utc = (dateKey: string) => {
        const [year, month, day] = dateKey.split('-').map(Number)
        return Date.UTC(year, month - 1, day)
    }
    return Math.max(1, Math.round((utc(to) - utc(from)) / 86_400_000) + 1)
}
