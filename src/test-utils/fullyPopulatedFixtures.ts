import type { Happy, HappyMonth, HappySettings } from '../happies/types'

/**
 * Fixtures with **every** field of their type populated, used by the
 * persistence round-trip tests (`database.test.ts` → "Field fidelity" and
 * `rdfSerialization.test.ts` → "Field fidelity").
 *
 * Why they live here, in `src` rather than in a `.test.ts` file:
 * `tsconfig.app.json` excludes test files from type checking, so a fixture
 * defined inside a test would not be checked. Here it is, which is the whole
 * point:
 *
 *   `Required<...>` means adding a new optional field to `Happy`, `HappyMonth`
 *   or `HappySettings` **breaks the type check** (`npm test` runs it first)
 *   until the field is added below — and once it is added, the round-trip tests
 *   fail unless the field actually survives being saved and read back, both
 *   through PouchDB and through the pod's RDF.
 *
 * That pair is the guard against the whole class of bug where a new field is
 * added to a type, shows up correctly on screen from React state, and is
 * quietly dropped by persistence — which the user only discovers after a
 * reload, by which time the data is gone. pack-me-up lost three fields that way
 * (its #260), and this is the mechanism that stopped it happening again.
 *
 * So: when the type check points you here, add the new field with a
 * distinctive value. Don't reach for `as` or a partial fixture. A field that
 * genuinely must not leave the device belongs in `happyLocalOnlyFields` in
 * `database.ts`, with a comment saying why.
 */

export const fullyPopulatedHappy: Required<Happy> = {
    id: 'happy-1',
    date: '2026-09-10',
    text: 'The dog worked out how to open the back door',
    mood: 4,
    tags: ['family', 'dog'],
    createdAt: '2026-09-10T08:15:00.000Z',
    lastModified: '2026-09-10T08:20:00.000Z',
}

/** A second one, so tests can tell "kept the array" from "kept the first item". */
export const fullyPopulatedSecondHappy: Required<Happy> = {
    id: 'happy-2',
    date: '2026-09-11',
    text: 'Sat outside with a coffee before anyone else was up',
    mood: 2,
    tags: ['quiet', 'coffee'],
    createdAt: '2026-09-11T06:40:00.000Z',
    lastModified: '2026-09-11T06:40:00.000Z',
}

export const fullyPopulatedMonth: Required<Omit<HappyMonth, '_rev'>> = {
    month: '2026-09',
    happies: [fullyPopulatedHappy, fullyPopulatedSecondHappy],
    deletions: [{ id: 'happy-gone', deletedAt: '2026-09-09T21:00:00.000Z' }],
    lastModified: '2026-09-11T06:40:00.000Z',
}

export const fullyPopulatedSettings: Required<Omit<HappySettings, '_rev'>> = {
    displayName: 'Sam',
    promptsEnabled: false,
    moodEnabled: false,
    onThisDayEnabled: false,
    lastModified: '2026-09-11T06:40:00.000Z',
}
