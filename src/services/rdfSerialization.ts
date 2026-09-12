import {
    buildThing,
    createSolidDataset,
    getBoolean,
    getDatetime,
    getInteger,
    getStringNoLocale,
    getStringNoLocaleAll,
    getThing,
    getUrlAll,
    setThing,
} from '@inrupt/solid-client'
import type { SolidDataset, Thing } from '@inrupt/solid-client'
import { DCTERMS, HT, RDF } from './rdfVocab'
import { DEFAULT_SETTINGS, MoodValueSchema } from '../happies/types'
import type { Happy, HappyDeletion, HappyMonth, HappySettings, MoodValue } from '../happies/types'

/**
 * Happy Track's data, as RDF in the user's pod.
 *
 * Two things are load-bearing here and are pinned by tests:
 *
 * - **Every field survives the round trip.** `rdfSerialization.test.ts` puts a
 *   `Required<Happy>` fixture through `toDataset` → `fromDataset` and asserts
 *   it comes back identical. Adding a field to `Happy` breaks the type check on
 *   that fixture until it is covered, which is the guard against a field being
 *   written locally and silently lost on the way to the pod.
 * - **A happy's identity is its `#happy-<id>` fragment**, not its position.
 *   Merging is by id (see `mergeHappyMonths`), so the id has to be recoverable
 *   from the document without reference to the order things happen to be in.
 */

// ── HappyMonth ────────────────────────────────────────────────────────────────

export function happyMonthToDataset(month: HappyMonth, datasetUrl: string): SolidDataset {
    let ds = createSolidDataset()

    let root = buildThing({ url: datasetUrl })
        .addUrl(RDF.type, HT.HappyMonth)
        .addStringNoLocale(HT.monthKey, month.month)

    if (month.lastModified) {
        root = root.addDatetime(DCTERMS.modified, new Date(month.lastModified))
    }

    for (const happy of month.happies) {
        const happyUrl = `${datasetUrl}#happy-${happy.id}`
        root = root.addUrl(HT.hasHappy, happyUrl)
        ds = setThing(ds, happyToThing(happy, happyUrl))
    }

    for (const deletion of month.deletions) {
        const deletionUrl = `${datasetUrl}#deleted-${deletion.id}`
        root = root.addUrl(HT.hasDeletion, deletionUrl)
        ds = setThing(ds, buildThing({ url: deletionUrl })
            .addUrl(RDF.type, HT.HappyDeletion)
            .addStringNoLocale(HT.deletedHappyId, deletion.id)
            .addDatetime(HT.happyDeletedAt, new Date(deletion.deletedAt))
            .build())
    }

    return setThing(ds, root.build())
}

export function datasetToHappyMonth(dataset: SolidDataset, datasetUrl: string): HappyMonth {
    const root = getThing(dataset, datasetUrl)
    if (!root) throw new Error(`No HappyMonth at ${datasetUrl}`)

    // The filename is the fallback rather than the primary source: a document
    // states its own month, and only a copy written by an older client (or moved
    // by hand) needs the name read for it. `||`, not `??`: an empty monthKey is
    // as absent as a missing one, and `??` would accept the empty string.
    const month = getStringNoLocale(root, HT.monthKey)
        || datasetUrl.split('/').pop()?.replace(/\.ttl$/, '')
        || ''

    const happies = getUrlAll(root, HT.hasHappy)
        .map(url => thingToHappy(getThing(dataset, url), url))
        .filter((happy): happy is Happy => happy !== null)

    const deletions = getUrlAll(root, HT.hasDeletion)
        .map(url => {
            const thing = getThing(dataset, url)
            if (!thing) return null
            const id = getStringNoLocale(thing, HT.deletedHappyId)
                ?? (url.split('#')[1] ?? '').replace(/^deleted-/, '')
            const deletedAt = getDatetime(thing, HT.happyDeletedAt)?.toISOString()
            if (!id || !deletedAt) return null
            return { id, deletedAt }
        })
        .filter((deletion): deletion is HappyDeletion => deletion !== null)

    const lastModified = getDatetime(root, DCTERMS.modified)?.toISOString()

    return {
        month,
        happies,
        deletions,
        ...(lastModified ? { lastModified } : {}),
    }
}

// ── Happy ─────────────────────────────────────────────────────────────────────

function happyToThing(happy: Happy, happyUrl: string): Thing {
    let thing = buildThing({ url: happyUrl })
        .addUrl(RDF.type, HT.Happy)
        .addStringNoLocale(HT.text, happy.text)
        // A calendar day, so a plain string — see the note in rdfVocab.ts.
        .addStringNoLocale(HT.happyDate, happy.date)
        .addDatetime(DCTERMS.created, new Date(happy.createdAt))
        .addDatetime(HT.happyLastModified, new Date(happy.lastModified))

    if (happy.mood !== undefined) {
        thing = thing.addInteger(HT.mood, happy.mood)
    }

    for (const tag of happy.tags ?? []) {
        thing = thing.addStringNoLocale(HT.tag, tag)
    }

    return thing.build()
}

function thingToHappy(thing: Thing | null, url: string): Happy | null {
    if (!thing) return null

    const text = getStringNoLocale(thing, HT.text)
    const date = getStringNoLocale(thing, HT.happyDate)
    // A happy with no words or no day is not a happy. Dropping it rather than
    // throwing keeps one malformed entry from taking a whole month's document
    // down with it.
    if (text === null || date === null) return null

    const id = (url.split('#')[1] ?? '').replace(/^happy-/, '')
    if (!id) return null

    const createdAt = getDatetime(thing, DCTERMS.created)?.toISOString()
    const lastModified = getDatetime(thing, HT.happyLastModified)?.toISOString()

    const tags = getStringNoLocaleAll(thing, HT.tag)
    const mood = readMood(thing)

    return {
        id,
        text,
        date,
        // A document written before these were recorded still has to sort and
        // merge, and the day it belongs to is the best available guess at when.
        createdAt: createdAt ?? `${date}T00:00:00.000Z`,
        lastModified: lastModified ?? createdAt ?? `${date}T00:00:00.000Z`,
        ...(mood !== undefined ? { mood } : {}),
        ...(tags.length > 0 ? { tags } : {}),
    }
}

/**
 * The mood, if the document carries one this app understands.
 *
 * Validated rather than cast: the scale is 1–5 and a pod is writable by
 * anything the user has authorised, so a `ht:mood 9` is a real possibility.
 * Taking it as a `MoodValue` would put a face-less value into a lookup that
 * assumes one, and the entry would render with an empty mood chip.
 */
function readMood(thing: Thing): MoodValue | undefined {
    const raw = getInteger(thing, HT.mood)
    if (raw === null) return undefined
    const parsed = MoodValueSchema.safeParse(raw)
    return parsed.success ? parsed.data : undefined
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function settingsToDataset(settings: HappySettings, datasetUrl: string): SolidDataset {
    let root = buildThing({ url: datasetUrl })
        .addUrl(RDF.type, HT.Settings)
        .addBoolean(HT.promptsEnabled, settings.promptsEnabled)
        .addBoolean(HT.moodEnabled, settings.moodEnabled)
        .addBoolean(HT.onThisDayEnabled, settings.onThisDayEnabled)

    if (settings.displayName) {
        root = root.addStringNoLocale(HT.displayName, settings.displayName)
    }

    if (settings.lastModified) {
        root = root.addDatetime(DCTERMS.modified, new Date(settings.lastModified))
    }

    return setThing(createSolidDataset(), root.build())
}

export function datasetToSettings(dataset: SolidDataset, datasetUrl: string): HappySettings {
    const root = getThing(dataset, datasetUrl)
    if (!root) throw new Error(`No Settings at ${datasetUrl}`)

    const displayName = getStringNoLocale(root, HT.displayName) ?? undefined
    const lastModified = getDatetime(root, DCTERMS.modified)?.toISOString()

    // `?? DEFAULT_SETTINGS.x` rather than `?? false`: a setting absent from the
    // document has never been chosen, and the default is the app's answer to
    // that. Defaulting to false would silently turn features off for anyone
    // whose settings file predates them.
    return {
        promptsEnabled: getBoolean(root, HT.promptsEnabled) ?? DEFAULT_SETTINGS.promptsEnabled,
        moodEnabled: getBoolean(root, HT.moodEnabled) ?? DEFAULT_SETTINGS.moodEnabled,
        onThisDayEnabled: getBoolean(root, HT.onThisDayEnabled) ?? DEFAULT_SETTINGS.onThisDayEnabled,
        ...(displayName ? { displayName } : {}),
        ...(lastModified ? { lastModified } : {}),
    }
}
