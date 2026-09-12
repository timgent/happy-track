import { describe, expect, it } from 'vitest'
import {
    addDays,
    dateKeyOf,
    daysBetween,
    formatDayHeading,
    formatMonthHeading,
    isDateKey,
    isMonthKey,
    monthKeyOf,
    monthKeysBetween,
    parseDateKey,
    previousMonthKey,
    nextMonthKey,
    sameDayInEarlierYears,
} from './dates'

describe('dateKeyOf', () => {
    it('uses the local calendar day, not the UTC one', () => {
        // 23:30 on the 10th in a UTC+13 zone is still the 10th to the person
        // typing. Constructing the Date from local parts is what pins that.
        const lateEvening = new Date(2026, 8, 10, 23, 30)
        expect(dateKeyOf(lateEvening)).toBe('2026-09-10')
    })

    it('zero-pads months and days', () => {
        expect(dateKeyOf(new Date(2026, 0, 5))).toBe('2026-01-05')
    })
})

describe('parseDateKey', () => {
    it('round-trips through dateKeyOf', () => {
        expect(dateKeyOf(parseDateKey('2026-02-28'))).toBe('2026-02-28')
    })

    it('lands on local midnight rather than UTC midnight', () => {
        const parsed = parseDateKey('2026-06-15')
        expect(parsed.getHours()).toBe(0)
        expect(parsed.getDate()).toBe(15)
        expect(parsed.getMonth()).toBe(5)
    })
})

describe('isDateKey / isMonthKey', () => {
    it.each([
        ['2026-09-10', true],
        ['2026-9-10', false],
        ['2026-09', false],
        ['', false],
        ['not-a-date', false],
        ['2026-13-01', false],
        ['2026-02-30', false],
    ])('isDateKey(%s) is %s', (value, expected) => {
        expect(isDateKey(value)).toBe(expected)
    })

    it.each([
        ['2026-09', true],
        ['2026-9', false],
        ['2026-09-10', false],
        ['2026-00', false],
        ['2026-13', false],
    ])('isMonthKey(%s) is %s', (value, expected) => {
        expect(isMonthKey(value)).toBe(expected)
    })
})

describe('monthKeyOf', () => {
    it('takes the month from a date key', () => {
        expect(monthKeyOf('2026-09-10')).toBe('2026-09')
    })
})

describe('addDays', () => {
    it('crosses a month boundary', () => {
        expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    })

    it('crosses a year boundary backwards', () => {
        expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    })

    it('handles a leap day', () => {
        expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    })

    it('survives a spring-forward day, where a day is 23 hours long', () => {
        // Adding 24 hours to a Date lands on the same calendar day in a zone
        // that shifted its clock; going through the calendar parts does not.
        expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    })
})

describe('daysBetween', () => {
    it('counts whole calendar days', () => {
        expect(daysBetween('2026-09-01', '2026-09-10')).toBe(9)
    })

    it('is zero for the same day', () => {
        expect(daysBetween('2026-09-01', '2026-09-01')).toBe(0)
    })

    it('is negative when the later date comes first', () => {
        expect(daysBetween('2026-09-10', '2026-09-01')).toBe(-9)
    })

    it('is exact across a daylight-saving boundary', () => {
        expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    })
})

describe('monthKeysBetween', () => {
    it('lists every month inclusive, oldest first', () => {
        expect(monthKeysBetween('2025-11', '2026-02')).toEqual([
            '2025-11', '2025-12', '2026-01', '2026-02',
        ])
    })

    it('is a single month when both ends match', () => {
        expect(monthKeysBetween('2026-02', '2026-02')).toEqual(['2026-02'])
    })

    it('is empty when the range runs backwards', () => {
        expect(monthKeysBetween('2026-02', '2026-01')).toEqual([])
    })
})

describe('previousMonthKey / nextMonthKey', () => {
    it('steps across a year boundary', () => {
        expect(previousMonthKey('2026-01')).toBe('2025-12')
        expect(nextMonthKey('2025-12')).toBe('2026-01')
    })
})

describe('sameDayInEarlierYears', () => {
    it('offers the same day one and two years back', () => {
        expect(sameDayInEarlierYears('2026-09-10', 2)).toEqual(['2025-09-10', '2024-09-10'])
    })

    it('skips a 29 February that does not exist in the earlier year', () => {
        // 2024-02-29 exists; 2025-02-29 does not, and inventing 2025-03-01
        // would resurface a happy from the wrong day.
        expect(sameDayInEarlierYears('2028-02-29', 4)).toEqual(['2024-02-29'])
    })
})

describe('formatDayHeading', () => {
    const today = '2026-09-10'

    it('names today and yesterday rather than dating them', () => {
        expect(formatDayHeading('2026-09-10', today)).toBe('Today')
        expect(formatDayHeading('2026-09-09', today)).toBe('Yesterday')
    })

    it('uses the weekday for the rest of the last week', () => {
        expect(formatDayHeading('2026-09-07', today)).toBe('Monday 7 September')
    })

    it('includes the year once the date is in a different one', () => {
        expect(formatDayHeading('2025-12-24', today)).toBe('Wednesday 24 December 2025')
    })
})

describe('formatMonthHeading', () => {
    it('drops the year for the current one and keeps it otherwise', () => {
        expect(formatMonthHeading('2026-09', '2026-09')).toBe('September')
        expect(formatMonthHeading('2025-09', '2026-09')).toBe('September 2025')
    })
})
