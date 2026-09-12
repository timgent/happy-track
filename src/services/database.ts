import PouchDB from 'pouchdb'
import type { HappyMonth, HappySettings } from '../happies/types'
import { emptyMonth } from '../happies/types'
import { isMonthKey } from '../happies/dates'

export type DocumentType = 'happy-month' | 'settings'

export interface BaseDocument {
    _id: string
    _rev?: string
    docType: DocumentType
    createdAt: string
    updatedAt: string
}

export interface HappyMonthDocument extends BaseDocument {
    docType: 'happy-month'
    data: Omit<HappyMonth, 'month' | '_rev'>
}

export interface SettingsDocument extends BaseDocument {
    docType: 'settings'
    data: Omit<HappySettings, '_rev'>
}

export type AppDocument = HappyMonthDocument | SettingsDocument

/**
 * Namespace used when the user is not signed in to a pod.
 * Data saved here is local to this browser only.
 */
export const LOCAL_NAMESPACE = 'local'

/** Every database this app creates is named `happy-track-data--<namespace>`. */
export const DATABASE_NAME_PREFIX = 'happy-track-data--'

export function databaseNameForNamespace(namespace: string): string {
    return `${DATABASE_NAME_PREFIX}${namespace}`
}

const MONTH_ID_PREFIX = 'happy-month:'
const SETTINGS_ID = 'settings:1'

/**
 * Fields deliberately kept off the device's copy only — nothing yet.
 *
 * Listed as an empty array rather than not existing, because the *absence* of
 * such a list is what `toDocumentData` relies on: persistence is an omit-list,
 * so every field of `Happy` reaches both PouchDB and the pod by default. A
 * field that genuinely must never leave the device goes here, with a comment
 * saying why — and the round-trip tests are then told to expect it missing.
 */
export const happyLocalOnlyFields: readonly string[] = []

function hasName(err: unknown): err is { name: string } {
    return typeof err === 'object' && err !== null && 'name' in err
}

/**
 * Thrown when a document isn't in the local database.
 *
 * A real Error rather than an object literal: a plain `{ name, message }` that
 * reaches `Sentry.captureException` is reported as "Object captured as
 * exception with keys: message, name" — no message, no app stack frames,
 * nothing to act on. `name` stays `'not_found'` so PouchDB's own
 * `err.name === 'not_found'` convention keeps working unchanged.
 */
export class NotFoundError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'not_found'
    }
}

/**
 * Builds a document's `data` payload from an entity by *omitting* the keys the
 * document itself owns, plus any explicitly-undefined values so absent fields
 * stay absent in PouchDB.
 *
 * Deliberately an omit-list rather than an allowlist. An allowlist has to be
 * remembered every time a field is added to the type, and forgetting it drops
 * the field silently — no type error, no failing test, and the user only finds
 * out after a reload, when whatever they wrote is gone. pack-me-up lost three
 * fields exactly that way. Derived this way, a new field is persisted by
 * default and the guard in `test-utils/fullyPopulatedFixtures.ts` proves it.
 */
function toDocumentData<T extends object, K extends keyof T & string>(
    entity: T,
    omitKeys: readonly K[]
): Omit<T, K> {
    const data: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(entity)) {
        if ((omitKeys as readonly string[]).includes(key)) continue
        if ((happyLocalOnlyFields as readonly string[]).includes(key)) continue
        if (value === undefined) continue
        data[key] = value
    }
    return data as Omit<T, K>
}

/** How many times a save retries a revision conflict before giving up. */
const MAX_RETRIES = 3

export class HappyTrackDatabase {
    private db: PouchDB.Database<AppDocument>
    private static instances: Map<string, HappyTrackDatabase> = new Map()

    private constructor(namespace: string) {
        this.db = new PouchDB<AppDocument>(databaseNameForNamespace(namespace))
    }

    /**
     * The database instance for a namespace — `LOCAL_NAMESPACE` when signed out,
     * `sanitizePodUrl(podUrl)` when signed in. Cached, so the same namespace
     * always hands back the same handle.
     */
    public static getInstance(namespace: string): HappyTrackDatabase {
        if (!HappyTrackDatabase.instances.has(namespace)) {
            HappyTrackDatabase.instances.set(namespace, new HappyTrackDatabase(namespace))
        }
        return HappyTrackDatabase.instances.get(namespace)!
    }

    /**
     * Drops every cached instance, so the next `getInstance` opens a fresh
     * handle. Needed after the underlying databases are destroyed — a cached
     * instance would otherwise keep serving a database that no longer exists.
     */
    public static forgetAllInstances(): void {
        HappyTrackDatabase.instances.clear()
    }

    /**
     * Turns a pod URL into a safe, human-readable database namespace.
     * `https://sam.solidcommunity.net/` → `sam.solidcommunity.net`
     */
    public static sanitizePodUrl(podUrl: string): string {
        return podUrl
            .replace(/^https?:\/\//, '')
            .replace(/\/+$/, '')
            .replace(/\//g, '_')
    }

    // ── Months ───────────────────────────────────────────────────────────────

    /**
     * One month, or null when nothing has been written in it.
     *
     * Null rather than throwing: for a journal, "nothing in November yet" is the
     * overwhelmingly common case — every caller would otherwise open with a
     * `try`/`catch` around the normal path.
     */
    public async getMonth(monthKey: string): Promise<HappyMonth | null> {
        try {
            const doc = await this.db.get(`${MONTH_ID_PREFIX}${monthKey}`)
            if (doc.docType !== 'happy-month') {
                throw new Error(`Document ${doc._id} is not a happy month`)
            }
            // Spread the whole stored payload — see `toDocumentData` — so a read
            // cannot drop a field the write kept.
            return { ...doc.data, month: monthKey, _rev: doc._rev }
        } catch (err: unknown) {
            if (hasName(err) && err.name === 'not_found') return null
            throw err
        }
    }

    /** One month, or an empty one — for callers that only want to render it. */
    public async getMonthOrEmpty(monthKey: string): Promise<HappyMonth> {
        return (await this.getMonth(monthKey)) ?? emptyMonth(monthKey)
    }

    /**
     * Every month on this device, oldest first.
     *
     * A whole journal in one read. That sounds extravagant and is not: a month
     * is one document, so this is twelve reads a year of a local database that
     * answers in single-digit milliseconds, and it is what the streak and the
     * insights page are computed from. Doing it any other way would mean
     * caching derived state, which is the thing that goes stale.
     */
    public async getAllMonths(): Promise<HappyMonth[]> {
        const result = await this.db.allDocs({
            include_docs: true,
            startkey: MONTH_ID_PREFIX,
            endkey: `${MONTH_ID_PREFIX}￰`,
        })

        const months: HappyMonth[] = []
        for (const row of result.rows) {
            if (row.doc && row.doc.docType === 'happy-month') {
                const monthKey = row.id.slice(MONTH_ID_PREFIX.length)
                months.push({ ...row.doc.data, month: monthKey, _rev: row.doc._rev })
            }
        }
        // `allDocs` is already in id order, which for `YYYY-MM` keys is
        // chronological — but say so rather than rely on it.
        return months.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
    }

    public async saveMonth(month: HappyMonth): Promise<{ rev: string }> {
        if (!isMonthKey(month.month)) {
            // A bad key would be written as its own document and never read
            // back by any month-keyed lookup — silently losing the entry.
            throw new Error(`Not a month key: ${month.month}`)
        }
        const docId = `${MONTH_ID_PREFIX}${month.month}`
        const now = new Date().toISOString()

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const existingDoc = await this.getExisting(docId, 'happy-month')

                const result = await this.db.put({
                    _id: docId,
                    // Always the freshly-fetched _rev: the caller's copy can lag
                    // behind PouchDB while a pod save is still in flight, which
                    // is what turns two quick entries into a 409.
                    _rev: existingDoc?._rev,
                    docType: 'happy-month',
                    createdAt: existingDoc?.createdAt ?? now,
                    updatedAt: now,
                    data: toDocumentData(month, ['month', '_rev']),
                } satisfies HappyMonthDocument)
                return { rev: result.rev }
            } catch (err) {
                if (hasName(err) && err.name === 'conflict' && attempt < MAX_RETRIES) continue
                throw err
            }
        }
        throw new Error('saveMonth: max retries exceeded')
    }

    /** Removes a month document outright. No tombstone — see `dataDeletion`. */
    public async deleteMonth(monthKey: string): Promise<void> {
        try {
            const doc = await this.db.get(`${MONTH_ID_PREFIX}${monthKey}`)
            await this.db.remove(doc)
        } catch (err: unknown) {
            if (hasName(err) && err.name === 'not_found') return
            throw err
        }
    }

    // ── Settings ─────────────────────────────────────────────────────────────

    /** The stored preferences, or null when the user has never changed any. */
    public async getSettings(): Promise<HappySettings | null> {
        try {
            const doc = await this.db.get(SETTINGS_ID)
            if (doc.docType !== 'settings') {
                throw new Error(`Document ${doc._id} is not settings`)
            }
            return { ...doc.data, _rev: doc._rev }
        } catch (err: unknown) {
            if (hasName(err) && err.name === 'not_found') return null
            throw err
        }
    }

    public async saveSettings(settings: HappySettings): Promise<{ rev: string }> {
        const now = new Date().toISOString()

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const existingDoc = await this.getExisting(SETTINGS_ID, 'settings')

                const result = await this.db.put({
                    _id: SETTINGS_ID,
                    _rev: existingDoc?._rev,
                    docType: 'settings',
                    createdAt: existingDoc?.createdAt ?? now,
                    updatedAt: now,
                    data: toDocumentData(settings, ['_rev']),
                } satisfies SettingsDocument)
                return { rev: result.rev }
            } catch (err) {
                if (hasName(err) && err.name === 'conflict' && attempt < MAX_RETRIES) continue
                throw err
            }
        }
        throw new Error('saveSettings: max retries exceeded')
    }

    // ── Housekeeping ─────────────────────────────────────────────────────────

    public getInfo() {
        return this.db.info()
    }

    public async isEmpty(): Promise<boolean> {
        const info = await this.getInfo()
        return info.doc_count === 0
    }

    /**
     * Copies everything from another namespace into this one, merging months
     * that both hold rather than overwriting.
     *
     * The merge matters: this runs when someone who has been writing happies
     * signed out signs in to a pod that already has happies in it (a second
     * device, say). Overwriting either side would throw away real entries.
     */
    public async copyAllDataFrom(
        source: HappyTrackDatabase,
        merge: (local: HappyMonth, incoming: HappyMonth) => HappyMonth,
    ): Promise<void> {
        for (const incoming of await source.getAllMonths()) {
            const existing = await this.getMonth(incoming.month)
            const resolved = existing ? merge(existing, { ...incoming, _rev: undefined }) : incoming
            await this.saveMonth({ ...resolved, month: incoming.month, _rev: undefined })
        }

        // Settings only travel when this namespace has none of its own: a pod
        // that already states a preference is the more deliberate answer.
        const incomingSettings = await source.getSettings()
        if (incomingSettings && !(await this.getSettings())) {
            await this.saveSettings({ ...incomingSettings, _rev: undefined })
        }
    }

    /** The existing document at `docId`, or undefined; other errors propagate. */
    private async getExisting<D extends DocumentType>(
        docId: string,
        docType: D,
    ): Promise<Extract<AppDocument, { docType: D }> | undefined> {
        try {
            const doc = await this.db.get(docId)
            if (doc.docType !== docType) return undefined
            return doc as Extract<AppDocument, { docType: D }>
        } catch (err: unknown) {
            if (hasName(err) && err.name === 'not_found') return undefined
            throw err
        }
    }
}
