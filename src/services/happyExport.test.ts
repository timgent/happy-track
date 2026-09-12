import { describe, expect, it } from 'vitest'
import { EXPORT_VERSION, exportFilename, toPlainText } from './happyExport'
import type { HappyMonth } from '../happies/types'

const months: HappyMonth[] = [
    {
        month: '2026-08',
        happies: [{
            id: 'a',
            date: '2026-08-03',
            text: 'Swimming in the sea',
            tags: ['holiday'],
            createdAt: '2026-08-03T10:00:00.000Z',
            lastModified: '2026-08-03T10:00:00.000Z',
        }],
        deletions: [],
    },
    {
        month: '2026-09',
        happies: [
            {
                id: 'b',
                date: '2026-09-10',
                text: 'Coffee before work',
                createdAt: '2026-09-10T06:00:00.000Z',
                lastModified: '2026-09-10T06:00:00.000Z',
            },
            {
                id: 'c',
                date: '2026-09-10',
                text: 'Walked home the long way',
                createdAt: '2026-09-10T18:00:00.000Z',
                lastModified: '2026-09-10T18:00:00.000Z',
            },
        ],
        deletions: [],
    },
]

describe('exportFilename', () => {
    it('carries the date, so a folder of exports sorts usefully', () => {
        expect(exportFilename(new Date('2026-09-10T12:00:00.000Z'))).toBe('happy-track-2026-09-10.json')
    })
})

describe('EXPORT_VERSION', () => {
    it('is a number an importer can compare against', () => {
        expect(typeof EXPORT_VERSION).toBe('number')
    })
})

describe('toPlainText', () => {
    it('groups by day, newest first, matching how the journal reads', () => {
        const text = toPlainText(months)

        expect(text.indexOf('2026-09-10')).toBeLessThan(text.indexOf('2026-08-03'))
    })

    it('puts every happy from a day under one heading', () => {
        expect(toPlainText(months)).toContain('2026-09-10\n- Coffee before work\n- Walked home the long way')
    })

    it('includes the tags when there are any', () => {
        expect(toPlainText(months)).toContain('- Swimming in the sea  [holiday]')
    })

    it('is empty for an empty journal', () => {
        expect(toPlainText([])).toBe('')
    })
})
