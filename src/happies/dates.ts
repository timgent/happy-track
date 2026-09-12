/**
 * Days and months, as the calendar strings the app stores them as.
 *
 * Everything here works on `YYYY-MM-DD` ("date key") and `YYYY-MM` ("month
 * key") strings rather than `Date` objects, for one reason: a daily happy
 * belongs to the writer's own calendar day. Someone typing at 23:30 means that
 * day, and an instant stored in UTC files it under the next one for anybody
 * reading from a different zone — including the same person on holiday. Plain
 * calendar strings have no zone to get wrong.
 *
 * The arithmetic goes through the calendar parts rather than through
 * milliseconds for the same class of reason: a day is not always 24 hours long.
 * On the morning the clocks go forward it is 23, and `+ 86_400_000` lands back
 * on the day it started from.
 */

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_KEY = /^(\d{4})-(\d{2})$/

/** The local calendar day `when` falls on, as `YYYY-MM-DD`. */
export function dateKeyOf(when: Date = new Date()): string {
    const year = when.getFullYear()
    const month = String(when.getMonth() + 1).padStart(2, '0')
    const day = String(when.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

/** Today, as a date key. */
export function todayKey(now: Date = new Date()): string {
    return dateKeyOf(now)
}

/** This month, as a month key. */
export function thisMonthKey(now: Date = new Date()): string {
    return monthKeyOf(dateKeyOf(now))
}

/**
 * A date key as a `Date` at *local* midnight.
 *
 * `new Date('2026-06-15')` is parsed as UTC midnight by spec, which in any
 * negative-offset zone is the evening of the 14th — so a date key round-tripped
 * through it comes back a day early for half the world. Passing the parts to
 * the constructor is what keeps it local.
 */
export function parseDateKey(dateKey: string): Date {
    const match = DATE_KEY.exec(dateKey)
    if (!match) throw new Error(`Not a date key: ${dateKey}`)
    const [, year, month, day] = match
    return new Date(Number(year), Number(month) - 1, Number(day))
}

/** True for a real `YYYY-MM-DD` day — 2026-02-30 is neither. */
export function isDateKey(value: string): boolean {
    const match = DATE_KEY.exec(value)
    if (!match) return false
    const [, year, month, day] = match
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    // A month or day out of range rolls over rather than failing, so the only
    // reliable check is whether the parts survived the trip.
    return (
        date.getFullYear() === Number(year) &&
        date.getMonth() === Number(month) - 1 &&
        date.getDate() === Number(day)
    )
}

/** True for a real `YYYY-MM` month. */
export function isMonthKey(value: string): boolean {
    const match = MONTH_KEY.exec(value)
    if (!match) return false
    const month = Number(match[2])
    return month >= 1 && month <= 12
}

/** The month a date key falls in. */
export function monthKeyOf(dateKey: string): string {
    return dateKey.slice(0, 7)
}

/** `dateKey` moved by `days`, through the calendar rather than through millis. */
export function addDays(dateKey: string, days: number): string {
    const date = parseDateKey(dateKey)
    date.setDate(date.getDate() + days)
    return dateKeyOf(date)
}

/**
 * Whole calendar days from `from` to `to`, negative when `to` is earlier.
 *
 * Both ends are normalised to UTC midnight before subtracting, so a
 * daylight-saving shift inside the range cannot leave a fractional day to be
 * rounded the wrong way.
 */
export function daysBetween(from: string, to: string): number {
    const utcMidnight = (dateKey: string) => {
        const [year, month, day] = dateKey.split('-').map(Number)
        return Date.UTC(year, month - 1, day)
    }
    return Math.round((utcMidnight(to) - utcMidnight(from)) / 86_400_000)
}

/** The month before `monthKey`. */
export function previousMonthKey(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number)
    return month === 1
        ? `${year - 1}-12`
        : `${year}-${String(month - 1).padStart(2, '0')}`
}

/** The month after `monthKey`. */
export function nextMonthKey(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number)
    return month === 12
        ? `${year + 1}-01`
        : `${year}-${String(month + 1).padStart(2, '0')}`
}

/** Every month from `from` to `to` inclusive, oldest first; empty if reversed. */
export function monthKeysBetween(from: string, to: string): string[] {
    if (from > to) return []
    const months: string[] = []
    let current = from
    while (current <= to) {
        months.push(current)
        current = nextMonthKey(current)
    }
    return months
}

/**
 * The same day of the month in each of the previous `years` years, most recent
 * first, skipping any that does not exist.
 *
 * The skip is the whole reason this is a function rather than a subtraction:
 * only a leap year has a 29 February, and nudging it to the 1st of March would
 * have "on this day" resurface a happy from a day it did not happen on.
 */
export function sameDayInEarlierYears(dateKey: string, years: number): string[] {
    const [year, month, day] = dateKey.split('-')
    const keys: string[] = []
    for (let back = 1; back <= years; back++) {
        const candidate = `${Number(year) - back}-${month}-${day}`
        if (isDateKey(candidate)) keys.push(candidate)
    }
    return keys
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * How a day is named at the head of a group of happies.
 *
 * "Today" and "Yesterday" rather than the date, because that is what the reader
 * is actually thinking; the weekday for anything else, because "Monday 7
 * September" locates a memory and "07/09/2026" does not. The year appears only
 * once it differs from the current one — an always-on year is noise on the 95%
 * of entries written this year.
 *
 * Formatted by hand rather than with `Intl`: these strings are asserted in
 * tests and read by the E2E suite, and `Intl`'s output for the same date
 * differs between Node builds and locales.
 */
export function formatDayHeading(dateKey: string, today: string = todayKey()): string {
    if (dateKey === today) return 'Today'
    if (dateKey === addDays(today, -1)) return 'Yesterday'

    const date = parseDateKey(dateKey)
    const weekday = WEEKDAYS[date.getDay()]
    const month = MONTHS[date.getMonth()]
    const sameYear = dateKey.slice(0, 4) === today.slice(0, 4)
    return sameYear
        ? `${weekday} ${date.getDate()} ${month}`
        : `${weekday} ${date.getDate()} ${month} ${date.getFullYear()}`
}

/** How a month is named. The year is dropped for the current one. */
export function formatMonthHeading(monthKey: string, currentMonth: string = thisMonthKey()): string {
    const [year, month] = monthKey.split('-')
    const name = MONTHS[Number(month) - 1]
    return year === currentMonth.slice(0, 4) ? name : `${name} ${year}`
}

/**
 * Short form for a month on a chart axis — "Sep", or "Sep 25" once the year
 * matters.
 *
 * The year is what keeps two Septembers a year apart from collapsing into the
 * same axis label, which is exactly what happens if a long label is simply
 * truncated.
 */
export function formatShortMonth(monthKey: string, currentMonth: string = thisMonthKey()): string {
    const [year, month] = monthKey.split('-')
    const name = MONTHS[Number(month) - 1].slice(0, 3)
    return year === currentMonth.slice(0, 4) ? name : `${name} ${year.slice(2)}`
}

/** Short form for axis labels and chips — "10 Sep". */
export function formatShortDay(dateKey: string): string {
    const date = parseDateKey(dateKey)
    return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`
}
