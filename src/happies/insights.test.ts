import { describe, expect, it } from 'vitest'
import {
    happiesPerMonth,
    journalInsights,
    moodCounts,
    tagCounts,
    weekdayCounts,
} from './insights'
import type { Happy, HappyMonth, MoodValue } from './types'

function happy(id: string, date: string, overrides: Partial<Happy> = {}): Happy {
    return {
        id,
        date,
        text: `happy ${id}`,
        createdAt: `${date}T08:00:00.000Z`,
        lastModified: `${date}T08:00:00.000Z`,
        ...overrides,
    }
}

function month(monthKey: string, happies: Happy[]): HappyMonth {
    return { month: monthKey, happies, deletions: [] }
}

describe('tagCounts', () => {
    it('counts each tag across every month', () => {
        const months = [
            month('2026-08', [happy('a', '2026-08-01', { tags: ['family', 'walk'] })]),
            month('2026-09', [happy('b', '2026-09-01', { tags: ['family'] })]),
        ]

        expect(tagCounts(months)).toEqual([
            { tag: 'family', count: 2 },
            { tag: 'walk', count: 1 },
        ])
    })

    it('breaks ties alphabetically, so the list does not reshuffle between visits', () => {
        const months = [month('2026-09', [
            happy('a', '2026-09-01', { tags: ['zebra'] }),
            happy('b', '2026-09-02', { tags: ['apple'] }),
        ])]

        expect(tagCounts(months).map(t => t.tag)).toEqual(['apple', 'zebra'])
    })

    it('is empty when nothing is tagged', () => {
        expect(tagCounts([month('2026-09', [happy('a', '2026-09-01')])])).toEqual([])
    })
})

describe('happiesPerMonth', () => {
    it('includes the months with nothing in them', () => {
        // A chart that skipped the empty months would claim a run of activity
        // that did not happen.
        const months = [
            month('2026-06', [happy('a', '2026-06-01')]),
            month('2026-09', [happy('b', '2026-09-01')]),
        ]

        expect(happiesPerMonth(months, '2026-09').map(m => [m.month, m.count])).toEqual([
            ['2026-06', 1],
            ['2026-07', 0],
            ['2026-08', 0],
            ['2026-09', 1],
        ])
    })

    it('runs up to the current month even when nothing was written in it', () => {
        const months = [month('2026-06', [happy('a', '2026-06-01')])]

        expect(happiesPerMonth(months, '2026-08').map(m => m.month))
            .toEqual(['2026-06', '2026-07', '2026-08'])
    })

    it('is empty for a journal with no happies in it', () => {
        expect(happiesPerMonth([], '2026-09')).toEqual([])
        expect(happiesPerMonth([month('2026-09', [])], '2026-09')).toEqual([])
    })

    it('still produces a chart when the clock is behind the data', () => {
        // A device with a slow clock must not collapse the range to nothing.
        const months = [month('2026-09', [happy('a', '2026-09-10')])]

        expect(happiesPerMonth(months, '2026-01').map(m => m.month)).toEqual(['2026-09'])
    })

    it('gives the axis a short label that stays distinct across years', () => {
        // Truncating "September 2025" and "September" to three characters gives
        // two bars a year apart the same label.
        const months = [
            month('2025-09', [happy('a', '2025-09-01')]),
            month('2026-09', [happy('b', '2026-09-01')]),
        ]

        const labels = happiesPerMonth(months, '2026-09').map(m => m.shortLabel)

        expect(labels[0]).toBe('Sep 25')
        expect(labels[labels.length - 1]).toBe('Sep')
        expect(new Set(labels).size).toBe(labels.length)
    })

    it('labels the current year without the year and earlier ones with it', () => {
        const months = [
            month('2025-12', [happy('a', '2025-12-01')]),
            month('2026-01', [happy('b', '2026-01-01')]),
        ]

        expect(happiesPerMonth(months, '2026-01').map(m => m.label))
            .toEqual(['December 2025', 'January'])
    })
})

describe('moodCounts', () => {
    it('reports all five moods in scale order, zeros included', () => {
        const months = [month('2026-09', [
            happy('a', '2026-09-01', { mood: 3 }),
            happy('b', '2026-09-02', { mood: 3 }),
            happy('c', '2026-09-03', { mood: 5 }),
        ])]

        expect(moodCounts(months).map(m => [m.mood, m.count])).toEqual([
            [1, 0], [2, 0], [3, 2], [4, 0], [5, 1],
        ])
    })

    it('ignores happies with no mood', () => {
        const months = [month('2026-09', [happy('a', '2026-09-01')])]

        expect(moodCounts(months).every(m => m.count === 0)).toBe(true)
    })
})

describe('weekdayCounts', () => {
    it('reports Monday first', () => {
        expect(weekdayCounts([]).map(w => w.label))
            .toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    })

    it('counts happies onto the right day', () => {
        // 2026-09-10 is a Thursday; 2026-09-12 a Saturday.
        const months = [month('2026-09', [
            happy('a', '2026-09-10'),
            happy('b', '2026-09-10'),
            happy('c', '2026-09-12'),
        ])]

        const counts = weekdayCounts(months)

        expect(counts.find(w => w.label === 'Thu')?.count).toBe(2)
        expect(counts.find(w => w.label === 'Sat')?.count).toBe(1)
        expect(counts.find(w => w.label === 'Mon')?.count).toBe(0)
    })

    it('skips a date it cannot parse rather than producing a NaN column', () => {
        const months = [month('2026-09', [happy('a', 'not-a-date'), happy('b', '2026-09-10')])]

        const counts = weekdayCounts(months)

        expect(counts.reduce((total, w) => total + w.count, 0)).toBe(1)
    })
})

describe('journalInsights', () => {
    it('is all zeros for an empty journal', () => {
        const insights = journalInsights([], '2026-09', '2026-09-10')

        expect(insights.totalHappies).toBe(0)
        expect(insights.daysWritten).toBe(0)
        expect(insights.daysSinceFirst).toBe(0)
        expect(insights.firstDay).toBeUndefined()
        expect(insights.happiesPerMonth).toEqual([])
    })

    it('counts several happies on one day as one day written', () => {
        const months = [month('2026-09', [
            happy('a', '2026-09-10'),
            happy('b', '2026-09-10'),
            happy('c', '2026-09-11'),
        ])]

        const insights = journalInsights(months, '2026-09', '2026-09-11')

        expect(insights.totalHappies).toBe(3)
        expect(insights.daysWritten).toBe(2)
    })

    it('counts the first day itself, so day one is 1 of 1 rather than 1 of 0', () => {
        const months = [month('2026-09', [happy('a', '2026-09-10')])]

        expect(journalInsights(months, '2026-09', '2026-09-10').daysSinceFirst).toBe(1)
    })

    it('spans the whole journal when working out how long it has been going', () => {
        const months = [
            month('2026-08', [happy('a', '2026-08-01')]),
            month('2026-09', [happy('b', '2026-09-10')]),
        ]

        const insights = journalInsights(months, '2026-09', '2026-09-10')

        expect(insights.firstDay).toBe('2026-08-01')
        expect(insights.daysSinceFirst).toBe(41)
    })

    it('reports how many happies carry a mood, as the denominator for the mood chart', () => {
        const months = [month('2026-09', [
            happy('a', '2026-09-01', { mood: 2 as MoodValue }),
            happy('b', '2026-09-02'),
        ])]

        expect(journalInsights(months, '2026-09', '2026-09-02').moodedHappies).toBe(1)
    })
})
