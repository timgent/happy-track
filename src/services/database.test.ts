import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import PouchDB from 'pouchdb'
import PouchDBMemoryAdapter from 'pouchdb-adapter-memory'
import { HappyTrackDatabase, LOCAL_NAMESPACE, databaseNameForNamespace } from './database'
import { mergeHappyMonths } from '../happies/mergeMonths'
import { DEFAULT_SETTINGS } from '../happies/types'
import type { Happy, HappyMonth } from '../happies/types'
import {
    fullyPopulatedMonth,
    fullyPopulatedSettings,
} from '../test-utils/fullyPopulatedFixtures'

PouchDB.plugin(PouchDBMemoryAdapter)

/** Destroys and forgets every cached instance, so tests cannot see each other. */
async function resetInstances() {
    // @ts-expect-error — reaching into the private instance cache, for tests
    const instances = HappyTrackDatabase.instances as Map<string, HappyTrackDatabase>
    for (const instance of instances.values()) {
        // @ts-expect-error — reaching into the private PouchDB handle, for tests
        await instance.db.destroy()
    }
    instances.clear()
}

function happy(id: string, overrides: Partial<Happy> = {}): Happy {
    return {
        id,
        date: '2026-09-10',
        text: `happy ${id}`,
        createdAt: '2026-09-10T08:00:00.000Z',
        lastModified: '2026-09-10T08:00:00.000Z',
        ...overrides,
    }
}

describe('HappyTrackDatabase', () => {
    let db: HappyTrackDatabase

    beforeEach(async () => {
        await resetInstances()
        db = HappyTrackDatabase.getInstance(LOCAL_NAMESPACE)
    })

    afterEach(async () => {
        await resetInstances()
    })

    describe('Field fidelity', () => {
        /*
         * The guard described in test-utils/fullyPopulatedFixtures.ts: a new
         * optional field on the types breaks the type check until the fixture
         * covers it, and then fails here unless it survives the save.
         */

        it('persists every field of a month', async () => {
            await db.saveMonth(fullyPopulatedMonth)

            const loaded = await db.getMonth(fullyPopulatedMonth.month)

            expect(loaded).toMatchObject(fullyPopulatedMonth)
        })

        it('persists every field of the settings', async () => {
            await db.saveSettings(fullyPopulatedSettings)

            expect(await db.getSettings()).toMatchObject(fullyPopulatedSettings)
        })

        it('persists every field of a month read back through getAllMonths', async () => {
            // getMonth and getAllMonths read the payload by two different code
            // paths, and only one of them was covered above.
            await db.saveMonth(fullyPopulatedMonth)

            const [loaded] = await db.getAllMonths()

            expect(loaded).toMatchObject(fullyPopulatedMonth)
        })
    })

    describe('getMonth', () => {
        it('is null for a month with nothing in it', async () => {
            expect(await db.getMonth('2026-01')).toBeNull()
        })

        it('carries the month key from the document id, not the payload', async () => {
            await db.saveMonth({ month: '2026-09', happies: [happy('a')], deletions: [] })

            expect((await db.getMonth('2026-09'))?.month).toBe('2026-09')
        })

        it('carries a _rev that a follow-up save accepts', async () => {
            await db.saveMonth({ month: '2026-09', happies: [], deletions: [] })
            const loaded = await db.getMonth('2026-09')

            expect(loaded?._rev).toBeDefined()
            await expect(db.saveMonth({ ...loaded!, happies: [happy('a')] })).resolves.toBeDefined()
        })
    })

    describe('getMonthOrEmpty', () => {
        it('gives an empty month rather than null', async () => {
            expect(await db.getMonthOrEmpty('2026-01')).toEqual({
                month: '2026-01',
                happies: [],
                deletions: [],
            })
        })
    })

    describe('saveMonth', () => {
        it('updates in place rather than adding a second document', async () => {
            await db.saveMonth({ month: '2026-09', happies: [happy('a')], deletions: [] })
            await db.saveMonth({ month: '2026-09', happies: [happy('a'), happy('b')], deletions: [] })

            const months = await db.getAllMonths()

            expect(months).toHaveLength(1)
            expect(months[0].happies.map(h => h.id)).toEqual(['a', 'b'])
        })

        it('accepts a save whose _rev is stale, rather than failing with a conflict', async () => {
            // Two quick entries: the second still holds the _rev from before the
            // first landed, because the pod push in between is deliberately off
            // the critical path. This is the 409 that used to reach the user.
            await db.saveMonth({ month: '2026-09', happies: [happy('a')], deletions: [] })
            const stale = await db.getMonth('2026-09')
            await db.saveMonth({ ...stale!, happies: [happy('a'), happy('b')] })

            await expect(
                db.saveMonth({ ...stale!, happies: [happy('a'), happy('b'), happy('c')] }),
            ).resolves.toBeDefined()

            expect((await db.getMonth('2026-09'))?.happies.map(h => h.id)).toEqual(['a', 'b', 'c'])
        })

        it('keeps createdAt from the first save and moves updatedAt on', async () => {
            await db.saveMonth({ month: '2026-09', happies: [], deletions: [] })
            // @ts-expect-error — reading the raw document, for tests
            const first = await db.db.get('happy-month:2026-09')
            await new Promise(resolve => setTimeout(resolve, 2))
            await db.saveMonth({ month: '2026-09', happies: [happy('a')], deletions: [] })
            // @ts-expect-error — reading the raw document, for tests
            const second = await db.db.get('happy-month:2026-09')

            expect(second.createdAt).toBe(first.createdAt)
            expect(new Date(second.updatedAt).getTime()).toBeGreaterThan(new Date(first.updatedAt).getTime())
        })

        it('refuses a month key it could never read back', async () => {
            // Writing it would file the entry under a document no month-keyed
            // lookup visits — the happy would be stored and invisible.
            await expect(db.saveMonth({ month: 'September', happies: [], deletions: [] }))
                .rejects.toThrow(/Not a month key/)
        })

        it('drops undefined values rather than storing them', async () => {
            await db.saveMonth({
                month: '2026-09',
                happies: [{ ...happy('a'), mood: undefined, tags: undefined }],
                deletions: [],
                lastModified: undefined,
            })

            const loaded = await db.getMonth('2026-09')

            expect('lastModified' in loaded!).toBe(false)
            expect('mood' in loaded!.happies[0]).toBe(false)
        })
    })

    describe('getAllMonths', () => {
        it('is empty on a fresh device', async () => {
            expect(await db.getAllMonths()).toEqual([])
        })

        it('returns months oldest first, across a year boundary', async () => {
            for (const month of ['2026-01', '2025-12', '2026-10', '2025-07']) {
                await db.saveMonth({ month, happies: [], deletions: [] })
            }

            expect((await db.getAllMonths()).map(m => m.month))
                .toEqual(['2025-07', '2025-12', '2026-01', '2026-10'])
        })

        it('ignores the settings document', async () => {
            await db.saveSettings(DEFAULT_SETTINGS)
            await db.saveMonth({ month: '2026-09', happies: [], deletions: [] })

            expect((await db.getAllMonths()).map(m => m.month)).toEqual(['2026-09'])
        })
    })

    describe('deleteMonth', () => {
        it('removes the month', async () => {
            await db.saveMonth({ month: '2026-09', happies: [happy('a')], deletions: [] })
            await db.deleteMonth('2026-09')

            expect(await db.getMonth('2026-09')).toBeNull()
        })

        it('is a no-op for a month that was never written', async () => {
            await expect(db.deleteMonth('2026-01')).resolves.toBeUndefined()
        })
    })

    describe('settings', () => {
        it('is null before anything is chosen', async () => {
            expect(await db.getSettings()).toBeNull()
        })

        it('updates in place', async () => {
            await db.saveSettings({ ...DEFAULT_SETTINGS, displayName: 'Sam' })
            await db.saveSettings({ ...DEFAULT_SETTINGS, displayName: 'Alex' })

            expect((await db.getSettings())?.displayName).toBe('Alex')
        })
    })

    describe('namespacing', () => {
        it('keeps two identities' + ' data in separate databases', async () => {
            const mine = HappyTrackDatabase.getInstance('sam.example.com')
            const yours = HappyTrackDatabase.getInstance('alex.example.com')

            await mine.saveMonth({ month: '2026-09', happies: [happy('mine')], deletions: [] })

            expect(await yours.getMonth('2026-09')).toBeNull()
        })

        it('hands back the same instance for the same namespace', () => {
            expect(HappyTrackDatabase.getInstance('a.example.com'))
                .toBe(HappyTrackDatabase.getInstance('a.example.com'))
        })

        it('strips the scheme and trailing slash from a pod URL', () => {
            expect(HappyTrackDatabase.sanitizePodUrl('https://sam.solidcommunity.net/'))
                .toBe('sam.solidcommunity.net')
        })

        it('replaces inner slashes, so a path-based pod is still one name', () => {
            expect(HappyTrackDatabase.sanitizePodUrl('https://pod.example.com/sam/storage/'))
                .toBe('pod.example.com_sam_storage')
        })

        it('names the database after the namespace', () => {
            expect(databaseNameForNamespace('sam.example.com')).toBe('happy-track-data--sam.example.com')
        })
    })

    describe('isEmpty', () => {
        it('is true on a fresh device and false once something is written', async () => {
            expect(await db.isEmpty()).toBe(true)
            await db.saveMonth({ month: '2026-09', happies: [happy('a')], deletions: [] })
            expect(await db.isEmpty()).toBe(false)
        })
    })

    describe('copyAllDataFrom', () => {
        it('brings months across', async () => {
            const source = HappyTrackDatabase.getInstance('source')
            await source.saveMonth({ month: '2026-09', happies: [happy('a')], deletions: [] })

            await db.copyAllDataFrom(source, mergeHappyMonths)

            expect((await db.getMonth('2026-09'))?.happies.map(h => h.id)).toEqual(['a'])
        })

        it('merges a month both sides hold rather than overwriting it', async () => {
            // Signing in to a pod that already has happies in it, with happies
            // written on this device while signed out. Neither may be lost.
            const source = HappyTrackDatabase.getInstance('source')
            await source.saveMonth({ month: '2026-09', happies: [happy('local-one')], deletions: [] })
            await db.saveMonth({ month: '2026-09', happies: [happy('pod-one')], deletions: [] })

            await db.copyAllDataFrom(source, mergeHappyMonths)

            expect((await db.getMonth('2026-09'))?.happies.map(h => h.id).sort())
                .toEqual(['local-one', 'pod-one'])
        })

        it('takes the source settings only when this side has none', async () => {
            const source = HappyTrackDatabase.getInstance('source')
            await source.saveSettings({ ...DEFAULT_SETTINGS, displayName: 'From local' })
            await db.saveSettings({ ...DEFAULT_SETTINGS, displayName: 'Already on the pod' })

            await db.copyAllDataFrom(source, mergeHappyMonths)

            expect((await db.getSettings())?.displayName).toBe('Already on the pod')
        })

        it('never carries a source _rev across', async () => {
            // A _rev from another database is meaningless here and makes the
            // save a conflict.
            const source = HappyTrackDatabase.getInstance('source')
            await source.saveMonth({ month: '2026-09', happies: [happy('a')], deletions: [] })
            await source.saveMonth({ ...(await source.getMonth('2026-09'))!, happies: [happy('a'), happy('b')] })

            await expect(db.copyAllDataFrom(source, mergeHappyMonths)).resolves.toBeUndefined()
            expect((await db.getMonth('2026-09'))?.happies).toHaveLength(2)
        })
    })

    describe('forgetAllInstances', () => {
        it('opens a fresh handle afterwards', () => {
            const before = HappyTrackDatabase.getInstance('x.example.com')
            HappyTrackDatabase.forgetAllInstances()

            expect(HappyTrackDatabase.getInstance('x.example.com')).not.toBe(before)
        })
    })
})

describe('a month at the far end of the key range', () => {
    // `getAllMonths` bounds its scan with a high-codepoint sentinel; a month in
    // the year 9999 must still be inside it.
    beforeEach(async () => {
        await resetInstances()
    })

    it('is still listed', async () => {
        const db = HappyTrackDatabase.getInstance(LOCAL_NAMESPACE)
        const far: HappyMonth = { month: '9999-12', happies: [], deletions: [] }
        await db.saveMonth(far)

        expect((await db.getAllMonths()).map(m => m.month)).toContain('9999-12')
    })
})
