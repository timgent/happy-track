import { z } from 'zod'

/**
 * The five moods, as a scale rather than a set of labels: they are shown as one
 * row of faces and read left to right, so the number is the ordering and the
 * face is only how it is drawn (see `MOODS` below).
 *
 * Optional everywhere it appears. A happy is one sentence typed in five
 * seconds; making the mood compulsory would turn that into a form, and the
 * whole point is that there is nothing to fill in but the happy itself.
 */
export const MoodValueSchema = z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
])

export type MoodValue = z.infer<typeof MoodValueSchema>

export interface MoodDescriptor {
    value: MoodValue
    emoji: string
    /** What a screen reader says, and the word shown under the face when picked. */
    label: string
}

/**
 * Deliberately five and deliberately all positive-to-neutral: this is a record
 * of a good thing that happened, and a scale running down to "awful" invites a
 * different kind of entry than the one the app is for. The low end is "quietly
 * pleased", not "miserable".
 */
export const MOODS: readonly MoodDescriptor[] = [
    { value: 1, emoji: '🙂', label: 'Quietly pleased' },
    { value: 2, emoji: '😊', label: 'Happy' },
    { value: 3, emoji: '😄', label: 'Really happy' },
    { value: 4, emoji: '🤩', label: 'Delighted' },
    { value: 5, emoji: '🥳', label: 'Over the moon' },
] as const

export function moodFor(value: MoodValue | undefined): MoodDescriptor | undefined {
    return MOODS.find(mood => mood.value === value)
}

/**
 * One happy thing, on one day.
 *
 * `date` is a plain `YYYY-MM-DD` string in the writer's own timezone, not a
 * timestamp. A "daily happy" is about the user's day: someone writing at 23:30
 * in Auckland means that day, and storing an instant would file it under the
 * next one for anybody reading in UTC. `createdAt` keeps the instant, for
 * ordering within a day and for "you wrote this at 7am" if that is ever useful.
 *
 * `lastModified` is per-entry rather than only per-month, because the month is
 * the unit that syncs (see `HappyMonth`) and two devices that both added a
 * happy in September must end up with both. Merging needs a timestamp on the
 * thing being merged.
 */
export interface Happy {
    id: string
    /** The day this belongs to, `YYYY-MM-DD`, in the writer's local timezone. */
    date: string
    text: string
    mood?: MoodValue
    /** Free-form, lower-cased, no leading `#`. Order is the user's own. */
    tags?: string[]
    createdAt: string
    lastModified: string
}

/**
 * A deleted happy leaves a tombstone rather than simply vanishing.
 *
 * The month document is a set of entries that two devices can both add to, so
 * "deleted on my phone" and "not uploaded from my laptop yet" are the same
 * observation from the pod's side: an id present in one copy and absent from
 * the other. Without the tombstone the merge puts every deletion back. This is
 * the same reasoning as pack-me-up's deleted-packing-lists registry, kept
 * inside the month because a happy only ever lives in one month.
 */
export interface HappyDeletion {
    id: string
    deletedAt: string
}

/**
 * One month of happies — the unit that is stored and synced.
 *
 * Per-entry files would mean a request per happy (a thousand a year) and
 * per-day files a request per day; a month is one small document, twelve a
 * year, and it is also the span the journal and the insights page read at a
 * time. Conflicts inside one are handled by `mergeHappyMonths`.
 */
export interface HappyMonth {
    /** `YYYY-MM`. Doubles as the PouchDB document id and the pod filename. */
    month: string
    happies: Happy[]
    /** Tombstones for happies deleted from this month. */
    deletions: HappyDeletion[]
    /** Set by `useSyncCoordinator` on save; absent on a month never yet saved. */
    lastModified?: string
    _rev?: string
}

export function emptyMonth(month: string): HappyMonth {
    return { month, happies: [], deletions: [] }
}

/**
 * The handful of preferences worth carrying between devices.
 *
 * Kept in the pod rather than in localStorage precisely because they are
 * small and personal: someone who turns the mood picker off on their phone
 * meant it about the app, not about that phone. The theme is the exception and
 * stays local — it is about the device you are looking at.
 */
export interface HappySettings {
    /** What the app greets you by, when a WebID is not what you want to read. */
    displayName?: string
    /** Offer a gentle prompt when the box is empty and you are stuck. */
    promptsEnabled: boolean
    /** Show the mood faces in the composer. */
    moodEnabled: boolean
    /** Resurface a happy from this day in an earlier month or year. */
    onThisDayEnabled: boolean
    lastModified?: string
    _rev?: string
}

export const DEFAULT_SETTINGS: HappySettings = {
    promptsEnabled: true,
    moodEnabled: true,
    onThisDayEnabled: true,
}

/**
 * Normalises a tag the way both the composer and the merge need it: trimmed,
 * lower-cased, no leading `#`, inner whitespace collapsed. Tags are compared by
 * value everywhere (filtering, suggestions, insights), so "Family", "family "
 * and "#family" have to be one tag or the counts are nonsense.
 */
export function normaliseTag(raw: string): string {
    return raw
        .trim()
        .replace(/^#+/, '')
        .replace(/\s+/g, ' ')
        .toLowerCase()
}

/** Longest a single happy may be. Long enough for a paragraph, short enough to stay a happy. */
export const MAX_HAPPY_LENGTH = 1000

/** Longest a single tag may be. */
export const MAX_TAG_LENGTH = 40

/** Most tags one happy may carry, so the chip row stays a chip row. */
export const MAX_TAGS_PER_HAPPY = 8
