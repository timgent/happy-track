import type { HappyMonth, HappySettings } from '../happies/types'
import type { HappyTrackDatabase } from './database'

/**
 * Taking your journal with you.
 *
 * The format is deliberately plain JSON rather than the RDF the pod holds: this
 * file is for a person and for other software, and "here is an array of
 * entries with a date and some text" is readable by both. The pod copy is
 * already the machine-readable one, in a vocabulary another Solid app can
 * follow (see `rdfVocab.ts`), so nothing is lost by making the export the
 * friendly half of the pair.
 *
 * `version` is here so a future format change can be recognised rather than
 * guessed at, and `exportedAt` so two exports can be told apart.
 */

/** Bumped when the shape below changes in a way an importer must notice. */
export const EXPORT_VERSION = 1

export interface HappyExport {
    app: 'happy-track'
    version: number
    exportedAt: string
    settings?: HappySettings
    months: HappyMonth[]
}

/**
 * Everything on this device, as one object.
 *
 * Revisions are stripped: `_rev` identifies a document inside one PouchDB and
 * means nothing anywhere else, so carrying it into an export only creates a
 * conflict for whatever reads it back.
 */
export async function exportEverything(db: HappyTrackDatabase): Promise<HappyExport> {
    const months = await db.getAllMonths()
    const settings = await db.getSettings()

    return {
        app: 'happy-track',
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        ...(settings ? { settings: stripRev(settings) } : {}),
        months: months.map(stripRev),
    }
}

function stripRev<T extends { _rev?: string }>(value: T): T {
    const { _rev, ...rest } = value
    return rest as T
}

/** A filename with the date in it, so a folder of exports sorts usefully. */
export function exportFilename(now: Date = new Date()): string {
    const date = now.toISOString().slice(0, 10)
    return `happy-track-${date}.json`
}

/**
 * The journal as plain text, for anyone who wants to read it rather than parse
 * it — paste it into a document, print it, mail it to yourself.
 *
 * Newest day first, matching how the journal reads on screen.
 */
export function toPlainText(months: readonly HappyMonth[]): string {
    const byDate = new Map<string, string[]>()
    for (const month of months) {
        for (const happy of month.happies) {
            const lines = byDate.get(happy.date) ?? []
            lines.push(happy.tags?.length ? `- ${happy.text}  [${happy.tags.join(', ')}]` : `- ${happy.text}`)
            byDate.set(happy.date, lines)
        }
    }

    return [...byDate.entries()]
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .map(([date, lines]) => `${date}\n${lines.join('\n')}`)
        .join('\n\n')
}
