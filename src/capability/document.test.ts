import { describe, it, expect } from 'vitest'
import jsonld from 'jsonld'
import { Parser, Writer } from 'n3'
import { capabilityDescription } from './document'
import { AC_JSONLD_CONTEXT } from '../test-utils/acJsonLdContext'

const ORIGIN = 'https://happytrack.example'
const description = capabilityDescription(ORIGIN)

/**
 * The spec's context is not yet published at its own IRI, and a unit test has
 * no network anyway, so expansion is served the snapshot in
 * src/test-utils/acJsonLdContext.ts. Anything else is a genuine failure: the
 * document must not depend on a context this repo hasn't pinned.
 */
const documentLoader = async (url: string) => {
    if (url === 'https://www.w3.org/ns/ac.jsonld') {
        return { contextUrl: undefined, documentUrl: url, document: AC_JSONLD_CONTEXT }
    }
    throw new Error(`Refusing to fetch ${url} in a test`)
}

/**
 * Canonical N-Quads (RDFC-1.0), which is what makes the two representations
 * comparable: blank nodes — the inline hydra:mapping node, every sh:property
 * node — get stable labels derived from the triples around them, so two
 * documents come out byte-identical if and only if their graphs are isomorphic.
 */
async function canonicalQuads(nquads: string): Promise<string[]> {
    const canonical = await jsonld.canonize(nquads, {
        inputFormat: 'application/n-quads',
        format: 'application/n-quads',
    })
    return canonical.split('\n').filter(Boolean)
}

async function jsonldQuads(): Promise<string[]> {
    const nquads = await jsonld.toRDF(description.jsonld, {
        format: 'application/n-quads',
        documentLoader,
    }) as unknown as string
    return canonicalQuads(nquads)
}

async function turtleQuads(): Promise<string[]> {
    const quads = new Parser({ format: 'text/turtle' }).parse(description.turtle)
    const writer = new Writer({ format: 'application/n-quads' })
    writer.addQuads(quads)
    const nquads = await new Promise<string>((resolve, reject) => {
        writer.end((error, result) => (error ? reject(error) : resolve(result)))
    })
    return canonicalQuads(nquads)
}

describe('the JSON-LD and the Turtle are the same description', () => {
    it('produces byte-identical canonical quads from both representations', async () => {
        // The one seam in this subsystem: two hand-maintained syntaxes for one
        // description. If this fails, one of them was edited and the other
        // wasn't — the diff below names the triples that differ.
        const [fromJsonld, fromTurtle] = await Promise.all([jsonldQuads(), turtleQuads()])

        expect(fromTurtle).toEqual(fromJsonld)
    })

    it('actually produced a description, rather than agreeing on nothing', async () => {
        const quads = await jsonldQuads()
        expect(quads.length).toBeGreaterThan(50)
    })

    it('expands every term through the spec\'s own context, with none left as a bare CURIE', async () => {
        const quads = await jsonldQuads()

        // A term the context doesn't define would survive expansion verbatim.
        expect(quads.some(quad => /\bac:|hydra:|dpv:|odrl:|sh:|ht:/.test(quad))).toBe(false)
        expect(quads.some(quad => quad.includes('<https://www.w3.org/ns/ac#capability>'))).toBe(true)
        expect(quads.some(quad => quad.includes('<https://www.w3.org/ns/ac#open>'))).toBe(true)
        expect(quads.some(quad => quad.includes('<http://www.w3.org/ns/shacl#targetClass>'))).toBe(true)
    })
})

describe('the description describes this deployment', () => {
    it('builds every IRI from the origin it is given', () => {
        const preview = capabilityDescription('https://happy-track-git-branch.vercel.app')

        expect(preview.application.id).toBe('https://happy-track-git-branch.vercel.app/#i')
        expect(preview.turtle).toContain('<https://happy-track-git-branch.vercel.app/#i> a ac:Application')
        expect(preview.turtle).not.toContain('happytrack.tim-gent.com')
        expect(JSON.stringify(preview.jsonld)).not.toContain('happytrack.tim-gent.com')
    })

    it('tolerates a trailing slash on the origin', () => {
        expect(capabilityDescription('https://happytrack.example/').application.id).toBe(`${ORIGIN}/#i`)
    })

    it('names every capability and requirement it declares', () => {
        expect(description.application.capability).toEqual(description.capabilities.map(c => c.id))
        expect(description.application.requirement).toEqual(description.requirements.map(r => r.id))
    })
})

describe('every capability advertised is one the app can honour', () => {
    it('points each capability at an invocation the description defines', () => {
        const invocationIds = new Set(description.invocations.map(i => i.id))
        for (const capability of description.capabilities) {
            expect(invocationIds.has(capability.invocation)).toBe(true)
        }
    })

    it('gives every template variable a mapping, as the spec requires', () => {
        for (const invocation of description.invocations) {
            const variables = [...invocation.template.matchAll(/\{(\w+)\}/g)].map(m => m[1])
            const mapped = (invocation.mapping ?? []).map(m => m.variable)
            expect(mapped.sort()).toEqual(variables.sort())
        }
    })

    /**
     * The point of the whole exercise: an agent that reads this description and
     * follows a template has to land somewhere real. Each template is checked
     * against the routes in src/App.tsx — either a literal hash route, or the
     * open invocation that src/capability/openInvocation.ts handles.
     */
    it('uses only templates the app has a route for', () => {
        const templates = description.invocations.map(i => i.template)

        expect(templates).toEqual(['#open={open}', '#/today', '#/journal'])
    })
})
