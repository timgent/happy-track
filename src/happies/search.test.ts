import { describe, expect, it } from 'vitest'
import { groupByDay, searchHappies } from './search'
import type { Happy, HappyMonth } from './types'

function happy(id: string, date: string, text: string, tags?: string[]): Happy {
    return {
        id,
        date,
        text,
        createdAt: `${date}T08:00:00.000Z`,
        lastModified: `${date}T08:00:00.000Z`,
        ...(tags ? { tags } : {}),
    }
}

const months: HappyMonth[] = [
    {
        month: '2026-08',
        happies: [
            happy('a', '2026-08-03', 'Swimming in the sea at Cornwall', ['holiday']),
            happy('b', '2026-08-04', 'Ice cream on the beach', ['holiday', 'food']),
        ],
        deletions: [],
    },
    {
        month: '2026-09',
        happies: [
            happy('c', '2026-09-10', 'Café con leche before work', ['coffee']),
            happy('d', '2026-09-10', 'Walked home the long way'),
        ],
        deletions: [],
    },
]

describe('searchHappies', () => {
    it('shows one month when nothing is being searched for', () => {
        expect(searchHappies(months, { month: '2026-09' }).map(h => h.id)).toEqual(['c', 'd'])
    })

    it('searches the whole journal, not just the month on screen', () => {
        // Someone typing "cornwall" wants the holiday, wherever it was. A search
        // that silently scoped itself to September would say it never happened.
        expect(searchHappies(months, { query: 'cornwall', month: '2026-09' }).map(h => h.id))
            .toEqual(['a'])
    })

    it('ignores case', () => {
        expect(searchHappies(months, { query: 'CORNWALL' }).map(h => h.id)).toEqual(['a'])
    })

    it('ignores accents, either way round', () => {
        // A journal is typed quickly and nobody remembers whether they wrote
        // "Café" or "cafe".
        expect(searchHappies(months, { query: 'cafe' }).map(h => h.id)).toEqual(['c'])
        expect(searchHappies(months, { query: 'café' }).map(h => h.id)).toEqual(['c'])
    })

    it('matches a tag from the free-text box too', () => {
        expect(searchHappies(months, { query: 'holiday' }).map(h => h.id)).toEqual(['a', 'b'])
    })

    it('filters by tag across the whole journal', () => {
        expect(searchHappies(months, { tag: 'holiday' }).map(h => h.id)).toEqual(['a', 'b'])
    })

    it('normalises the tag it is given, so a "#Holiday" from a URL still matches', () => {
        expect(searchHappies(months, { tag: '#Holiday' }).map(h => h.id)).toEqual(['a', 'b'])
    })

    it('combines a tag and a query', () => {
        expect(searchHappies(months, { tag: 'holiday', query: 'ice cream' }).map(h => h.id))
            .toEqual(['b'])
    })

    it('is empty for a query that matches nothing', () => {
        expect(searchHappies(months, { query: 'tax return' })).toEqual([])
    })

    it('treats a whitespace-only query as no query at all', () => {
        expect(searchHappies(months, { query: '   ', month: '2026-08' }).map(h => h.id))
            .toEqual(['a', 'b'])
    })

    it('returns the whole journal when given no filters', () => {
        expect(searchHappies(months, {}).map(h => h.id)).toEqual(['a', 'b', 'c', 'd'])
    })

    it('orders results oldest first, across months', () => {
        expect(searchHappies(months, {}).map(h => h.date))
            .toEqual(['2026-08-03', '2026-08-04', '2026-09-10', '2026-09-10'])
    })
})

describe('groupByDay', () => {
    it('groups into days, newest day first', () => {
        const groups = groupByDay(searchHappies(months, {}))

        expect(groups.map(g => g.date)).toEqual(['2026-09-10', '2026-08-04', '2026-08-03'])
    })

    it('keeps a single day in the order it was written', () => {
        // The journal is read backwards; a day inside it is read forwards.
        const groups = groupByDay(searchHappies(months, { month: '2026-09' }))

        expect(groups[0].happies.map(h => h.id)).toEqual(['c', 'd'])
    })

    it('is empty for no happies', () => {
        expect(groupByDay([])).toEqual([])
    })
})
