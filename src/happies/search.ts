import type { Happy, HappyMonth } from './types'
import { allHappies } from './insights'
import { byDayThenWritten } from './mergeMonths'
import { normaliseTag } from './types'

export interface SearchFilters {
    /** Free text, matched against the happy's own words. */
    query?: string
    /** A tag the happy must carry. */
    tag?: string
    /** Only happies in this month. Ignored while a query or tag is set. */
    month?: string
}

export interface DayGroup {
    date: string
    happies: Happy[]
}

/**
 * Finding things in the journal.
 *
 * The one decision here worth stating: **searching leaves the month behind.**
 * A query or a tag filter searches the whole journal, not the month that
 * happened to be on screen — someone typing "cornwall" wants the holiday,
 * wherever it was, and a search that silently scoped itself to September
 * would report that they never went.
 *
 * Case- and accent-insensitive, because a journal is typed quickly and nobody
 * remembers whether they wrote "Café" or "cafe".
 */
function normalise(text: string): string {
    return text
        .toLowerCase()
        // Decompose, then strip the combining marks, so "café" matches "cafe".
        // Spelled as escapes rather than literal marks: the literal form is a
        // range of invisible characters that any editor or copy-paste can eat.
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

export function searchHappies(months: readonly HappyMonth[], filters: SearchFilters): Happy[] {
    const query = filters.query?.trim() ? normalise(filters.query.trim()) : undefined
    const tag = filters.tag ? normaliseTag(filters.tag) : undefined
    const searching = query !== undefined || tag !== undefined

    let candidates = searching
        ? allHappies(months)
        // No query and no tag: show the month asked for. An absent month means
        // the whole journal, which is what an insights link or a bare
        // /journal?tag= wants.
        : filters.month
            ? allHappies(months.filter(month => month.month === filters.month))
            : allHappies(months)

    if (tag !== undefined) {
        candidates = candidates.filter(happy => happy.tags?.includes(tag))
    }
    if (query !== undefined) {
        candidates = candidates.filter(happy =>
            normalise(happy.text).includes(query) ||
            // Tags are searchable text too: typing "family" should find the
            // happies tagged family, not just the ones that say the word.
            (happy.tags ?? []).some(happyTag => normalise(happyTag).includes(query)),
        )
    }

    return candidates.sort(byDayThenWritten)
}

/**
 * Happies grouped into days, newest day first.
 *
 * Newest first for reading: a journal is scrolled back through, so the most
 * recent day is the one you want at the top. Within a day the order stays
 * chronological — the morning's happy before the evening's — because a day is
 * read forwards even when the journal is read backwards.
 */
export function groupByDay(happies: readonly Happy[]): DayGroup[] {
    const byDate = new Map<string, Happy[]>()
    for (const happy of happies) {
        const group = byDate.get(happy.date)
        if (group) group.push(happy)
        else byDate.set(happy.date, [happy])
    }

    return [...byDate.entries()]
        .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
        .map(([date, group]) => ({ date, happies: [...group].sort(byDayThenWritten) }))
}
