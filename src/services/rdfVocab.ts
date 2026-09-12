import { DCTERMS, RDF } from '@inrupt/vocab-common-rdf'

export { DCTERMS, RDF }

export const HT_NS = 'https://happy-track.app/vocab#'

/**
 * Happy Track's own terms.
 *
 * Two conventions are worth knowing before adding to this list:
 *
 * - **Dates that mean a calendar day are plain strings, not datetimes.** A
 *   happy belongs to the writer's own day (see `src/happies/dates.ts`), and an
 *   `xsd:dateTime` round-tripped through a reader in another timezone comes
 *   back on the wrong side of midnight. Instants — created, modified, deleted —
 *   are datetimes, because an instant is genuinely a point on the line.
 * - **Anything that has to survive contact with another Solid app reuses a
 *   standard term.** `schema:text`, `dcterms:created` and `dcterms:modified`
 *   mean the same thing to a pod browser that has never heard of this app; a
 *   `ht:` term means nothing to anyone else, so it is used only where no
 *   standard term fits (the mood scale, the streak-relevant day key).
 */
export const HT = {
    // ── Classes ──────────────────────────────────────────────────────────────
    /** One month's worth of happies — the document that is stored and synced. */
    HappyMonth: `${HT_NS}HappyMonth`,
    /** One happy thing, on one day. */
    Happy: `${HT_NS}Happy`,
    /** A tombstone for a deleted happy. */
    HappyDeletion: `${HT_NS}HappyDeletion`,
    /** The user's preferences. */
    Settings: `${HT_NS}Settings`,

    // ── HappyMonth predicates ────────────────────────────────────────────────
    /** `YYYY-MM`. Kept on the document as well as in its filename so a copy
     *  that has been renamed still knows which month it is. */
    monthKey: `${HT_NS}monthKey`,
    hasHappy: `${HT_NS}hasHappy`,
    hasDeletion: `${HT_NS}hasDeletion`,

    // ── Happy predicates ─────────────────────────────────────────────────────
    /** The happy itself. `schema:text` — a standard term, so any pod browser
     *  showing this document shows the words rather than an opaque blob. */
    text: 'https://schema.org/text',
    /** The calendar day, as a plain `YYYY-MM-DD` string. See the note above. */
    happyDate: `${HT_NS}happyDate`,
    /** 1–5 on the app's own scale (see `MOODS`), stored as an integer rather
     *  than an emoji: the faces are presentation and may be restyled, the
     *  ordering is the data. */
    mood: `${HT_NS}mood`,
    /** One value per tag, normalised (see `normaliseTag`). Repeated strings
     *  rather than one comma-joined value, so a reader can match on a tag
     *  without parsing. */
    tag: `${HT_NS}tag`,
    /** Per-entry stamp, which is what `mergeHappyMonths` reconciles on. */
    happyLastModified: `${HT_NS}happyLastModified`,

    // ── HappyDeletion predicates ─────────────────────────────────────────────
    deletedHappyId: `${HT_NS}deletedHappyId`,
    happyDeletedAt: `${HT_NS}happyDeletedAt`,

    // ── Settings predicates ──────────────────────────────────────────────────
    displayName: 'https://schema.org/name',
    promptsEnabled: `${HT_NS}promptsEnabled`,
    moodEnabled: `${HT_NS}moodEnabled`,
    onThisDayEnabled: `${HT_NS}onThisDayEnabled`,
} as const
