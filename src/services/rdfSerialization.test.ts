import { describe, expect, it } from 'vitest'
import { solidDatasetAsTurtle } from '@inrupt/solid-client'
import {
    datasetToHappyMonth,
    datasetToSettings,
    happyMonthToDataset,
    settingsToDataset,
} from './rdfSerialization'
import { responseToDataset } from './rdfDataset'
import {
    fullyPopulatedMonth,
    fullyPopulatedSettings,
} from '../test-utils/fullyPopulatedFixtures'
import type { HappyMonth } from '../happies/types'

const MONTH_URL = 'https://pod.example.com/happy-track/months/2026-09.ttl'
const SETTINGS_URL = 'https://pod.example.com/happy-track/settings.ttl'

/** Turtle parsed the way `loadRdfFromPod` parses a pod response. */
async function parseTurtle(turtle: string, url: string) {
    const response = new Response(turtle, {
        status: 200,
        headers: { 'Content-Type': 'text/turtle' },
    })
    // `responseToDataset` reads the URL off the response, which a constructed
    // Response cannot set — so it is defined here, as the pod would report it.
    Object.defineProperty(response, 'url', { value: url })
    return responseToDataset(response)
}

/** A dataset round-tripped through real Turtle, the way the pod does it. */
async function throughTurtle(dataset: ReturnType<typeof happyMonthToDataset>, url: string) {
    return parseTurtle(await solidDatasetAsTurtle(dataset), url)
}

describe('Field fidelity', () => {
    /*
     * The guard described in test-utils/fullyPopulatedFixtures.ts. These use
     * `Required<...>` fixtures, so a new optional field on Happy, HappyMonth or
     * HappySettings fails the type check until it is in the fixture — and then
     * fails here until it actually survives the trip to the pod and back.
     */

    it('keeps every field of a month through a serialize/deserialize round trip', () => {
        const dataset = happyMonthToDataset(fullyPopulatedMonth, MONTH_URL)

        expect(datasetToHappyMonth(dataset, MONTH_URL)).toEqual(fullyPopulatedMonth)
    })

    it('keeps every field of a month through real Turtle', async () => {
        // The in-memory round trip above cannot catch a value that is written
        // with a datatype Turtle cannot express, or a literal that needs
        // escaping — this parses the actual bytes the pod would store.
        const dataset = await throughTurtle(happyMonthToDataset(fullyPopulatedMonth, MONTH_URL), MONTH_URL)

        expect(datasetToHappyMonth(dataset, MONTH_URL)).toEqual(fullyPopulatedMonth)
    })

    it('keeps every field of the settings through real Turtle', async () => {
        const dataset = await throughTurtle(settingsToDataset(fullyPopulatedSettings, SETTINGS_URL), SETTINGS_URL)

        expect(datasetToSettings(dataset, SETTINGS_URL)).toEqual(fullyPopulatedSettings)
    })
})

describe('happyMonthToDataset', () => {
    it('omits absent optional fields rather than writing empty values', () => {
        const month: HappyMonth = {
            month: '2026-09',
            happies: [{
                id: 'a',
                date: '2026-09-10',
                text: 'Bare minimum',
                createdAt: '2026-09-10T08:00:00.000Z',
                lastModified: '2026-09-10T08:00:00.000Z',
            }],
            deletions: [],
        }

        const result = datasetToHappyMonth(happyMonthToDataset(month, MONTH_URL), MONTH_URL)

        expect(result).toEqual(month)
        expect('mood' in result.happies[0]).toBe(false)
        expect('tags' in result.happies[0]).toBe(false)
        expect('lastModified' in result).toBe(false)
    })

    it('gives each happy its own id-derived fragment', async () => {
        const turtle = await solidDatasetAsTurtle(happyMonthToDataset(fullyPopulatedMonth, MONTH_URL))

        expect(turtle).toContain('#happy-happy-1')
        expect(turtle).toContain('#happy-happy-2')
        expect(turtle).toContain('#deleted-happy-gone')
    })

    it('writes the day as a plain string, not a datetime', async () => {
        // A timezone-free calendar day is the whole reason `happyDate` exists —
        // see the note in rdfVocab.ts. An xsd:dateTime here would come back a
        // day out for any reader east or west of the writer.
        const turtle = await solidDatasetAsTurtle(happyMonthToDataset(fullyPopulatedMonth, MONTH_URL))

        expect(turtle).toContain('"2026-09-10"')
        expect(turtle).not.toContain('"2026-09-10"^^')
    })

    it('writes the text with a term another Solid app understands', async () => {
        const turtle = await solidDatasetAsTurtle(happyMonthToDataset(fullyPopulatedMonth, MONTH_URL))

        // Serialised with the `schema:` prefix solid-client declares, so
        // either spelling of the same IRI counts.
        expect(turtle).toMatch(/schema:text|<https:\/\/schema\.org\/text>/)
        expect(turtle).toContain('@prefix schema: <https://schema.org/>')
    })

    it('survives text containing quotes, newlines and non-Latin script', async () => {
        const month: HappyMonth = {
            month: '2026-09',
            happies: [{
                id: 'a',
                date: '2026-09-10',
                text: 'She said "hello"\nand I laughed — 笑った 😄\\',
                createdAt: '2026-09-10T08:00:00.000Z',
                lastModified: '2026-09-10T08:00:00.000Z',
            }],
            deletions: [],
        }

        const dataset = await throughTurtle(happyMonthToDataset(month, MONTH_URL), MONTH_URL)

        expect(datasetToHappyMonth(dataset, MONTH_URL).happies[0].text).toBe(month.happies[0].text)
    })
})

describe('datasetToHappyMonth', () => {
    it('throws when the document has no month at its root', () => {
        expect(() => datasetToHappyMonth(settingsToDataset(fullyPopulatedSettings, SETTINGS_URL), MONTH_URL))
            .toThrow(/No HappyMonth/)
    })

    it('falls back to the filename when the document does not state its month', () => {
        // A hand-written or older document. The month has to come from
        // somewhere, or the entry cannot be filed.
        const dataset = happyMonthToDataset({ month: '', happies: [], deletions: [] }, MONTH_URL)

        expect(datasetToHappyMonth(dataset, MONTH_URL).month).toBe('2026-09')
    })

    it('skips a referenced happy that is not in the document', async () => {
        // What a truncated upload looks like: the month still lists the happy,
        // but the triples describing it never arrived. One missing entry must
        // not cost the reader the rest of the month.
        const turtle = await solidDatasetAsTurtle(happyMonthToDataset({
            month: '2026-09',
            happies: [{ id: 'good', date: '2026-09-10', text: 'Fine', createdAt: '2026-09-10T08:00:00.000Z', lastModified: '2026-09-10T08:00:00.000Z' }],
            deletions: [],
        }, MONTH_URL))
        const truncated = turtle.replace(
            /<https:\/\/happy-track\.app\/vocab#hasHappy> /,
            `<https://happy-track.app/vocab#hasHappy> <${MONTH_URL}#happy-ghost>, `,
        )

        const result = datasetToHappyMonth(await parseTurtle(truncated, MONTH_URL), MONTH_URL)

        expect(result.happies.map(h => h.id)).toEqual(['good'])
    })

    it('skips a happy whose text triple is missing', async () => {
        const turtle = await solidDatasetAsTurtle(happyMonthToDataset({
            month: '2026-09',
            happies: [
                { id: 'good', date: '2026-09-10', text: 'Fine', createdAt: '2026-09-10T08:00:00.000Z', lastModified: '2026-09-10T08:00:00.000Z' },
                { id: 'textless', date: '2026-09-11', text: 'Gone', createdAt: '2026-09-11T08:00:00.000Z', lastModified: '2026-09-11T08:00:00.000Z' },
            ],
            deletions: [],
        }, MONTH_URL))
        const damaged = turtle.replace('schema:text "Gone";', '')

        const result = datasetToHappyMonth(await parseTurtle(damaged, MONTH_URL), MONTH_URL)

        expect(result.happies.map(h => h.id)).toEqual(['good'])
    })

    it('ignores a mood outside the 1-5 scale', () => {
        // A pod is writable by anything the user authorised, so an out-of-range
        // value is a real possibility and must not reach the mood lookup.
        const dataset = happyMonthToDataset({
            month: '2026-09',
            happies: [{
                id: 'a',
                date: '2026-09-10',
                text: 'Hmm',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                mood: 9 as any,
                createdAt: '2026-09-10T08:00:00.000Z',
                lastModified: '2026-09-10T08:00:00.000Z',
            }],
            deletions: [],
        }, MONTH_URL)

        expect(datasetToHappyMonth(dataset, MONTH_URL).happies[0].mood).toBeUndefined()
    })
})

describe('datasetToSettings', () => {
    it('uses the app defaults for a setting the document does not mention', () => {
        // Turning a feature off for everyone whose settings file predates it is
        // the failure this guards against.
        const sparse = settingsToDataset(
            { promptsEnabled: true, moodEnabled: true, onThisDayEnabled: true },
            SETTINGS_URL,
        )

        expect(datasetToSettings(sparse, SETTINGS_URL)).toEqual({
            promptsEnabled: true,
            moodEnabled: true,
            onThisDayEnabled: true,
        })
    })
})
