import { useCallback, useMemo, useState } from 'react'
import { useDatabase } from '../components/DatabaseContext'
import { useLocalFirstLoad } from './useLocalFirstLoad'
import { useSolidPod } from '../components/SolidPodContext'
import { usePodSync } from './usePodSync'
import { useSyncCoordinator } from './useSyncCoordinator'
import { POD_CONTAINERS } from '../services/solidPod'
import { datasetToHappyMonth, happyMonthToDataset } from '../services/rdfSerialization'
import { mergeHappyMonths, withHappy, withoutHappy, writtenDaysIn } from '../happies/mergeMonths'
import { emptyMonth } from '../happies/types'
import type { Happy, HappyMonth, MoodValue } from '../happies/types'
import { monthKeyOf, thisMonthKey } from '../happies/dates'
import { generateUUID } from '../utils/uuid'

/**
 * How often the current month is re-read from the pod while the page is open.
 *
 * Ten seconds. The thing this catches is a happy written on a phone showing up
 * on a laptop that is already open — worth having, and not worth a request a
 * second. The read is a conditional GET, so a poll that finds nothing changed
 * costs a 304 and no parse at all (see `loadRdfFromPod`).
 */
const POLL_INTERVAL_MS = 10_000

export interface UseHappiesState {
    /** Every month on this device, oldest first. The journal and insights read this. */
    months: HappyMonth[]
    /** The month currently being written to — this month, unless told otherwise. */
    activeMonth: HappyMonth
    /** Every day with at least one happy, for the streak. */
    writtenDays: Set<string>
    /** True until the first local read comes back. */
    isLoading: boolean
    /** True while the pod could still turn "nothing here" into "here it is". */
    isCheckingPod: boolean
    /** True while a pod read is in flight after this page applied a pod change. */
    syncingFromPod: boolean
    /**
     * Writes a happy — new, or an edit of one that exists. Saves locally first
     * and pushes to the pod in the background, so the caller can render the
     * result immediately and nothing waits on the network.
     */
    saveHappy: (happy: Happy) => Promise<void>
    /** Removes a happy and leaves a tombstone, so the delete survives a sync. */
    deleteHappy: (happy: Happy) => Promise<void>
    /** Puts a deleted happy back, for the undo offered on the toast. */
    restoreHappy: (happy: Happy) => Promise<void>
}

/**
 * Builds a `Happy` from what the composer collected.
 *
 * Here rather than in the component so the id, the timestamps and the date all
 * come from one place: a happy whose `date` disagrees with its `createdAt`, or
 * whose `lastModified` predates its own creation, breaks the merge in ways that
 * only show up on a second device.
 */
export function newHappy(
    fields: { text: string; date: string; mood?: Happy['mood']; tags?: string[] },
    now: Date = new Date(),
): Happy {
    const at = now.toISOString()
    return {
        id: generateUUID(),
        text: fields.text,
        date: fields.date,
        createdAt: at,
        lastModified: at,
        ...(fields.mood !== undefined ? { mood: fields.mood } : {}),
        ...(fields.tags && fields.tags.length > 0 ? { tags: fields.tags } : {}),
    }
}

/**
 * A happy with the composer's fields applied to it.
 *
 * Here rather than in each page because clearing a field is the fiddly half:
 * an optional field the user has emptied has to become `undefined` — so that
 * `toDocumentData` omits it and the RDF does not carry it — rather than be left
 * at its old value. Today and the journal both offer editing, and doing this
 * twice is how the two drift.
 */
export function editedHappy(
    original: Happy,
    draft: { text: string; mood?: MoodValue; tags: string[] },
    now: Date = new Date(),
): Happy {
    return {
        ...original,
        text: draft.text,
        mood: draft.mood,
        tags: draft.tags.length > 0 ? draft.tags : undefined,
        lastModified: now.toISOString(),
    }
}

/**
 * The app's happies: read from the device, kept in step with the pod.
 *
 * The shape of this is the whole offline-first story in one place:
 *
 * - **Reads are local.** `useLocalFirstLoad` reads PouchDB on mount, which
 *   answers in milliseconds, and reads again if the sign-in sync brings
 *   something this device had never seen. Nothing on screen ever waits for the
 *   pod.
 * - **Writes are local first, pod second.** `saveWithSyncPrevention` stamps a
 *   monotonic `lastModified`, saves to PouchDB, and pushes to the pod after the
 *   next paint. A failed push is not a failed save — the happy is on the
 *   device, and the next sync carries it up.
 * - **The pod is polled, and what comes back is merged.** Both sides are
 *   writable, so a poll that finds a newer copy does not overwrite: it merges
 *   (see `mergeHappyMonths`) and pushes the merge back, so two devices
 *   converge instead of taking turns winning.
 *
 * @param monthKey which month to make active for writing; defaults to this one
 */
export function useHappies(monthKey: string = thisMonthKey()): UseHappiesState {
    const { db } = useDatabase()
    const { isLoggedIn } = useSolidPod()
    const [months, setMonths] = useState<HappyMonth[]>([])
    const [hasRead, setHasRead] = useState(false)

    const activeMonth = useMemo(
        () => months.find(month => month.month === monthKey) ?? emptyMonth(monthKey),
        [months, monthKey],
    )

    const readAll = useCallback(async () => {
        try {
            setMonths(await db.getAllMonths())
        } finally {
            setHasRead(true)
        }
    }, [db])

    const { isCheckingPod } = useLocalFirstLoad(readAll, [db])

    /**
     * Replaces one month in local state.
     *
     * State is updated from the saved copy rather than re-read from PouchDB:
     * the read is fast but not free, and doing it on every keystroke-sized save
     * is what makes a list feel laggy. The two cannot drift — every write goes
     * through here.
     */
    const putMonth = useCallback((saved: HappyMonth) => {
        setMonths(previous => {
            const without = previous.filter(month => month.month !== saved.month)
            return [...without, saved].sort((a, b) => (a.month < b.month ? -1 : 1))
        })
    }, [])

    const { saveToPod } = usePodSync<HappyMonth>({
        pathConfig: {
            container: POD_CONTAINERS.MONTHS,
            filename: (month: string) => `${month}.ttl`,
            resourceId: monthKey,
        },
        rdf: { serialize: happyMonthToDataset, deserialize: datasetToHappyMonth },
        // Polling only matters for the month being looked at; the rest of the
        // journal is reconciled by the sign-in sync.
        pollInterval: isLoggedIn ? POLL_INTERVAL_MS : undefined,
        onSyncSuccess: data => { void handleSyncSuccess(data) },
        enabled: isLoggedIn,
    })

    const { syncingFromPod, handleSyncSuccess, saveWithSyncPrevention } = useSyncCoordinator<HappyMonth>({
        currentData: activeMonth,
        saveToLocalDb: month => db.saveMonth(month),
        updateFormAndState: (month, rev) => putMonth({ ...month, _rev: rev }),
        // Both sides are writable, so neither simply wins — see the module note.
        mergeFunction: mergeHappyMonths,
        saveToPod,
        conflictStrategy: 'fallback-to-pod',
    })

    /**
     * Saves a change to whichever month the happy belongs to.
     *
     * The month is taken from the happy's own date, not from `monthKey`: editing
     * a happy from the journal's August view must write to August even while
     * September is the active month.
     */
    const applyToMonth = useCallback(
        async (happy: Happy, change: (month: HappyMonth) => HappyMonth) => {
            const targetKey = monthKeyOf(happy.date)
            // Read the month back rather than trusting local state: the pod poll
            // may have merged something into it since the last render, and
            // writing a stale copy would drop it.
            const current = (await db.getMonth(targetKey)) ?? emptyMonth(targetKey)
            // `saveToPod` is bound to `monthKey` — the month this hook polls —
            // which is not `targetKey` when the happy being edited belongs to a
            // different month (editing an old entry from the journal, say).
            // Pushing through the unqualified `saveToPod` would PUT this data at
            // the active month's URL, overwriting whatever that month actually
            // holds on the pod with a document that describes a different one.
            const pushToTargetMonth = (data: HappyMonth) => saveToPod(data, { resourceId: targetKey })
            const saved = await saveWithSyncPrevention(change(current), pushToTargetMonth)
            if (saved) putMonth(saved)
        },
        [db, putMonth, saveWithSyncPrevention, saveToPod],
    )

    const saveHappy = useCallback(
        (happy: Happy) => applyToMonth(happy, month => withHappy(month, happy)),
        [applyToMonth],
    )

    const deleteHappy = useCallback(
        (happy: Happy) => applyToMonth(happy, month => withoutHappy(month, happy.id)),
        [applyToMonth],
    )

    const restoreHappy = useCallback(
        (happy: Happy) => {
            // Stamped once, and moved forward so the restore beats its own
            // tombstone: `mergeHappyMonths` resolves that pair by which
            // happened later, and a restore carrying the entry's original
            // timestamp would simply be deleted again on the next merge.
            const restored: Happy = { ...happy, lastModified: new Date().toISOString() }
            return applyToMonth(restored, month => withHappy(month, restored))
        },
        [applyToMonth],
    )

    const writtenDays = useMemo(() => writtenDaysIn(months), [months])

    return {
        months,
        activeMonth,
        writtenDays,
        isLoading: !hasRead,
        isCheckingPod,
        syncingFromPod,
        saveHappy,
        deleteHappy,
        restoreHappy,
    }
}
