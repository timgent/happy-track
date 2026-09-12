import { Parser } from 'n3'
import type { Quad } from '@rdfjs/types'
import { responseToResourceInfo, getContentType } from '@inrupt/solid-client'
import type { SolidDataset, WithServerResourceInfo } from '@inrupt/solid-client'

/**
 * Turning a Pod response into a SolidDataset, without the quadratic step.
 *
 * `getSolidDataset` / `responseToSolidDataset` parse the Turtle (fast — N3 does
 * 5,000 quads in ~25ms) and then hand the quads to `fromRdfJsDataset`, which
 * accumulates them immutably: every quad spreads the whole graph, so a graph
 * with S subjects and Q quads costs O(Q × S). The app's question set is one
 * document holding every person, question, option and item, so it grows on both
 * axes at once — at 5,182 quads over 1,085 subjects that one conversion took
 * 1,044ms on a laptop, and 4.6s on a mid-range phone, all of it on the main
 * thread with the app already on screen. It was the whole of the freeze people
 * saw after logging in. See docs/login-performance.md.
 *
 * `datasetFromQuads` below builds the identical structure in a single linear
 * pass — 9ms for the same document, and `rdfDataset.test.ts` pins it against
 * `fromRdfJsDataset`'s own output so the two cannot drift.
 */

const LANG_STRING_IRI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'
const TURTLE_MIME_TYPE = 'text/turtle'

// The shape @inrupt/solid-client builds. Its own names for these parts
// (`Graph`, `Subject`, `Objects`) are internal, so they are spelled out here as
// the mutable versions we fill in before handing the result over as a
// SolidDataset.
interface MutableObjects {
    namedNodes?: string[]
    literals?: Record<string, string[]>
    langStrings?: Record<string, string[]>
    blankNodes?: string[]
}
interface MutableSubject {
    type: 'Subject'
    url: string
    predicates: Record<string, MutableObjects>
}
type MutableGraph = Record<string, MutableSubject>

/**
 * Builds the SolidDataset for a set of quads in one pass.
 *
 * Deliberately mutable while building and never frozen: `fromRdfJsDataset`
 * freezes each intermediate copy, and solid-client's own note on `freeze` says
 * runtime freezing may be more overhead than it is worth. Nothing in this app
 * writes to a dataset it has read — datasets are built fresh from the
 * serializers for every save — so the guarantee costs a full walk of the
 * structure and buys nothing.
 */
export function datasetFromQuads(quads: Quad[]): SolidDataset {
    const graphs: Record<string, MutableGraph> = { default: {} }

    for (const quad of quads) {
        if (quad.graph.termType !== 'NamedNode' && quad.graph.termType !== 'DefaultGraph') {
            throw new Error(`Cannot parse Quads with nodes of type [${quad.graph.termType}] as their Graph node.`)
        }
        if (quad.subject.termType !== 'NamedNode' && quad.subject.termType !== 'BlankNode') {
            throw new Error(`Cannot parse Quads with nodes of type [${quad.subject.termType}] as their Subject node.`)
        }
        if (quad.predicate.termType !== 'NamedNode') {
            throw new Error(`Cannot parse Quads with nodes of type [${quad.predicate.termType}] as their Predicate node.`)
        }

        const graphId = quad.graph.termType === 'DefaultGraph' ? 'default' : quad.graph.value
        const graph = graphs[graphId] ?? (graphs[graphId] = {})

        const subjectIri = quad.subject.termType === 'BlankNode' ? `_:${quad.subject.value}` : quad.subject.value
        const subject = graph[subjectIri]
            ?? (graph[subjectIri] = { type: 'Subject', url: subjectIri, predicates: {} })

        const objects = subject.predicates[quad.predicate.value]
            ?? (subject.predicates[quad.predicate.value] = {})

        const object = quad.object
        if (object.termType === 'NamedNode') {
            (objects.namedNodes ??= []).push(object.value)
        } else if (object.termType === 'BlankNode') {
            (objects.blankNodes ??= []).push(`_:${object.value}`)
        } else if (object.termType === 'Literal' && object.datatype.value === LANG_STRING_IRI) {
            const langStrings = objects.langStrings ??= {}
            const locale = object.language.toLowerCase()
            ;(langStrings[locale] ??= []).push(object.value)
        } else if (object.termType === 'Literal') {
            const literals = objects.literals ??= {}
            ;(literals[object.datatype.value] ??= []).push(object.value)
        } else {
            throw new Error(`Objects of type [${object.termType}] are not supported.`)
        }
    }

    return { type: 'Dataset', graphs } as unknown as SolidDataset
}

/**
 * What a Pod response that wasn't a success turns into.
 *
 * Carries `statusCode`, which is how the rest of this app tells a 404 ("nothing
 * there yet") from a 401 (`isAuthenticationError`) from a 304 (`loadRdfFromPod`'s
 * conditional GET saying "you already have this"). @inrupt/solid-client's own
 * `FetchError` cannot stand in here: building one for a 304 throws, because the
 * `ClientHttpError` inside it refuses any status below 400. That is why
 * `loadRdfFromPod`'s 304 branch never used to run against a real pod — the error
 * it got had no `statusCode` to match on.
 */
export class PodResponseError extends Error {
    readonly statusCode: number
    readonly response: Response

    constructor(response: Response, body: string) {
        super(`Fetching the SolidDataset at [${response.url}] failed: [${response.status}] [${response.statusText}] ${body}.`)
        this.name = 'PodResponseError'
        this.statusCode = response.status
        this.response = response
    }
}

/**
 * The parse half of `getSolidDataset`, for a response someone else fetched.
 *
 * Follows `responseToSolidDataset`'s contract — anything that wasn't a success
 * throws before the body is looked at — but throws a `PodResponseError` so
 * every status, 304 included, arrives with its `statusCode` intact.
 */
export async function responseToDataset(response: Response): Promise<SolidDataset & WithServerResourceInfo> {
    if (!response.ok) {
        throw new PodResponseError(response, await response.clone().text())
    }

    const resourceInfo = responseToResourceInfo(response)
    const contentType = getContentType(resourceInfo)
    if (contentType === null) {
        throw new Error(`Could not determine the content type of the Resource at [${response.url}].`)
    }
    const mimeType = contentType.split(';')[0].trim()
    if (mimeType !== TURTLE_MIME_TYPE) {
        throw new Error(
            `The Resource at [${response.url}] has a MIME type of [${mimeType}], but the only parser available is for [${TURTLE_MIME_TYPE}].`
        )
    }

    const quads = new Parser({ format: TURTLE_MIME_TYPE, baseIRI: response.url }).parse(await response.text())

    return { ...datasetFromQuads(quads), ...resourceInfo }
}
