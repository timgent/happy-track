import type { Happy, HappyDeletion, HappyMonth } from './types'

/**
 * Reconciling two copies of one month.
 *
 * The month document is the unit that syncs, and it is a *set* the user adds to
 * from whichever device is to hand. So the pod copy simply winning — the
 * strategy that works for a document one device owns — loses whichever happy
 * the other device wrote while they were apart. That is the failure this file
 * exists to prevent: a happy, once written, is never silently dropped.
 *
 * The rules, in order of how much they matter:
 *
 * 1. **Union by id.** A happy present in either copy is present in the result.
 * 2. **Per-entry `lastModified` decides an edit.** Both copies having id `a`
 *    means one of them edited it; the later stamp wins, and ties go to whichever
 *    text sorts first so that merging in either direction gives the same answer.
 * 3. **A tombstone beats an entry older than it.** Deleting is a deliberate act
 *    and has to stick, or the device still holding the copy re-uploads it.
 * 4. **An entry newer than its tombstone beats the tombstone**, and the
 *    tombstone goes. This is "I deleted it on my phone, then rewrote it on my
 *    laptop" — the rewrite is the later intention.
 *
 * Rule 2's tie-break and the sort at the end are what make this commutative:
 * `merge(a, b)` and `merge(b, a)` produce identical months, which is exactly
 * what two devices pushing merges at each other need in order to settle.
 */

function stampOf(iso: string | undefined): number {
    if (!iso) return 0
    const ms = new Date(iso).getTime()
    return Number.isNaN(ms) ? 0 : ms
}

/**
 * The surviving version of a happy both copies hold.
 *
 * The text tie-break looks arbitrary and is the point: `useSyncCoordinator`
 * hands out monotonically increasing timestamps, so a true tie means two
 * devices stamped the same millisecond, and the pair must still agree on an
 * answer without asking each other. Comparing the content is the only
 * tie-break available to both sides independently.
 */
function resolveHappy(left: Happy, right: Happy): Happy {
    const leftMs = stampOf(left.lastModified)
    const rightMs = stampOf(right.lastModified)
    if (leftMs !== rightMs) return leftMs > rightMs ? left : right
    return left.text <= right.text ? left : right
}

/** Day first, then the moment it was written — the order a journal reads in. */
function byDayThenWritten(a: Happy, b: Happy): number {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    const written = stampOf(a.createdAt) - stampOf(b.createdAt)
    // The id last, so the order is total: two happies written in the same
    // millisecond must still come out in one fixed order on every device.
    return written !== 0 ? written : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

export function mergeHappyMonths(local: HappyMonth, remote: HappyMonth): HappyMonth {
    const byId = new Map<string, Happy>()
    for (const happy of local.happies) byId.set(happy.id, happy)
    for (const happy of remote.happies) {
        const existing = byId.get(happy.id)
        byId.set(happy.id, existing ? resolveHappy(existing, happy) : happy)
    }

    // Latest tombstone per id, from both sides.
    const deletionById = new Map<string, HappyDeletion>()
    for (const deletion of [...local.deletions, ...remote.deletions]) {
        const existing = deletionById.get(deletion.id)
        if (!existing || stampOf(deletion.deletedAt) > stampOf(existing.deletedAt)) {
            deletionById.set(deletion.id, deletion)
        }
    }

    const happies: Happy[] = []
    for (const happy of byId.values()) {
        const deletion = deletionById.get(happy.id)
        if (!deletion) {
            happies.push(happy)
            continue
        }
        // Rule 4: rewritten after the delete, so the rewrite stands and the
        // tombstone is dropped — leaving it would delete the happy again on the
        // next merge.
        if (stampOf(happy.lastModified) > stampOf(deletion.deletedAt)) {
            deletionById.delete(happy.id)
            happies.push(happy)
        }
    }

    happies.sort(byDayThenWritten)
    const deletions = [...deletionById.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

    const lastModifiedMs = Math.max(stampOf(local.lastModified), stampOf(remote.lastModified))

    return {
        month: local.month,
        happies,
        deletions,
        // `_rev` is deliberately absent: it identifies a revision in one
        // PouchDB, and carrying the wrong side's across is how a save gets a
        // conflict. The caller saves this and takes the rev it is given.
        ...(lastModifiedMs > 0 ? { lastModified: new Date(lastModifiedMs).toISOString() } : {}),
    }
}

/**
 * `month` with `happy` added or replaced.
 *
 * Clearing the tombstone matters: without it, writing a happy whose id was
 * previously deleted (a re-save of something just undone) leaves both the entry
 * and its tombstone in the document, and the next merge honours the tombstone.
 */
export function withHappy(month: HappyMonth, happy: Happy): HappyMonth {
    const happies = month.happies.some(existing => existing.id === happy.id)
        ? month.happies.map(existing => (existing.id === happy.id ? happy : existing))
        : [...month.happies, happy]

    return {
        ...month,
        happies: [...happies].sort(byDayThenWritten),
        deletions: month.deletions.filter(deletion => deletion.id !== happy.id),
    }
}

/**
 * `month` with `id` removed and tombstoned.
 *
 * The tombstone is recorded even when the id was not there: the caller is
 * saying "this is deleted", and the copy that still holds it may be on another
 * device. Recording only what we can see would make the delete local-only.
 */
export function withoutHappy(
    month: HappyMonth,
    id: string,
    deletedAt: string = new Date().toISOString(),
): HappyMonth {
    return {
        ...month,
        happies: month.happies.filter(happy => happy.id !== id),
        deletions: [...month.deletions.filter(deletion => deletion.id !== id), { id, deletedAt }],
    }
}

/**
 * Whether two months hold the same data, `_rev` aside.
 *
 * Used to decide whether a merge actually changed anything, so a sync that
 * found nothing new does not write to the pod (and re-render the page) on every
 * poll.
 *
 * Compared field by field rather than by `JSON.stringify` of the whole object,
 * because `JSON.stringify` is sensitive to key *order*: a month read back from
 * PouchDB has its keys in the order the stored payload happened to be built,
 * and one straight from `mergeHappyMonths` has them in the order written here.
 * Two identical months could therefore compare unequal, and every sign-in would
 * re-upload every month it had just decided was already correct.
 */
export function monthsEqual(a: HappyMonth, b: HappyMonth): boolean {
    if (a.month !== b.month) return false
    if ((a.lastModified ?? null) !== (b.lastModified ?? null)) return false
    if (a.happies.length !== b.happies.length) return false
    if (a.deletions.length !== b.deletions.length) return false

    // Both sides come out of `mergeHappyMonths` or `withHappy`/`withoutHappy`
    // sorted, so a positional walk is enough — but sort defensively, because a
    // month straight off the wire has only the order the document gave it.
    const happiesOf = (month: HappyMonth) => [...month.happies].sort(byDayThenWritten)
    const left = happiesOf(a)
    const right = happiesOf(b)
    for (let i = 0; i < left.length; i++) {
        if (!happiesEqual(left[i], right[i])) return false
    }

    const byId = (x: HappyDeletion, y: HappyDeletion) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
    const leftDeletions = [...a.deletions].sort(byId)
    const rightDeletions = [...b.deletions].sort(byId)
    for (let i = 0; i < leftDeletions.length; i++) {
        if (leftDeletions[i].id !== rightDeletions[i].id) return false
        if (leftDeletions[i].deletedAt !== rightDeletions[i].deletedAt) return false
    }

    return true
}

function happiesEqual(a: Happy, b: Happy): boolean {
    return a.id === b.id
        && a.date === b.date
        && a.text === b.text
        && a.createdAt === b.createdAt
        && a.lastModified === b.lastModified
        && a.mood === b.mood
        && sameTags(a.tags, b.tags)
}

/** Tags compared in order — the order is the user's own, so it is data. */
function sameTags(a: string[] | undefined, b: string[] | undefined): boolean {
    if (a === undefined || a.length === 0) return b === undefined || b.length === 0
    if (b === undefined || a.length !== b.length) return false
    return a.every((tag, index) => tag === b[index])
}

/** Every day in these months that has at least one happy — the streak's input. */
export function writtenDaysIn(months: readonly HappyMonth[]): Set<string> {
    const days = new Set<string>()
    for (const month of months) {
        for (const happy of month.happies) days.add(happy.date)
    }
    return days
}

/** The happies in these months for one day, in reading order. */
export function happiesOnDay(months: readonly HappyMonth[], dateKey: string): Happy[] {
    return months
        .flatMap(month => month.happies)
        .filter(happy => happy.date === dateKey)
        .sort(byDayThenWritten)
}

export { byDayThenWritten }
