import { describe, it, expect } from 'vitest'
import { negotiateCapabilityDocument, requestOrigin } from './negotiate'

const JSONLD = 'application/ld+json'
const TURTLE = 'text/turtle'
const CHROME_ACCEPT =
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'

function get(accept?: string, url = 'https://happytrack.tim-gent.com/', headers: Record<string, string> = {}) {
    return new Request(url, {
        headers: accept === undefined ? headers : { ...headers, accept },
    })
}

describe('negotiateCapabilityDocument — who gets the app', () => {
    it('passes a real browser through to the SPA', () => {
        expect(negotiateCapabilityDocument(get(CHROME_ACCEPT))).toBeNull()
    })

    it('passes a request with no Accept header through to the SPA', () => {
        expect(negotiateCapabilityDocument(get())).toBeNull()
    })

    it('passes a bare */* — a plain curl — through to the SPA', () => {
        expect(negotiateCapabilityDocument(get('*/*'))).toBeNull()
    })

    it('passes text/html through to the SPA', () => {
        expect(negotiateCapabilityDocument(get('text/html'))).toBeNull()
    })

    it('does not let application/* stand in for an explicit ask', () => {
        expect(negotiateCapabilityDocument(get('application/*'))).toBeNull()
    })

    it('passes an unrelated media type through rather than guessing', () => {
        expect(negotiateCapabilityDocument(get('application/json'))).toBeNull()
    })

    it('passes through when the RDF ask is explicitly weighted below HTML', () => {
        expect(negotiateCapabilityDocument(get(`${JSONLD};q=0.5, text/html;q=0.9`))).toBeNull()
        expect(negotiateCapabilityDocument(get(`${TURTLE};q=0.2, ${CHROME_ACCEPT}`))).toBeNull()
    })

    it('passes through on a q=0 ask, which means "not this"', () => {
        expect(negotiateCapabilityDocument(get(`${JSONLD};q=0`))).toBeNull()
    })

    it('gives the app to a client that wants both equally, so nobody gets a blank page', () => {
        // A link-preview bot or SDK default that sends both at q=1 is far more
        // likely to want the page than the description.
        expect(negotiateCapabilityDocument(get(`${JSONLD}, text/html`))).toBeNull()
        expect(negotiateCapabilityDocument(get(`${TURTLE}, text/html`))).toBeNull()
    })
})

describe('negotiateCapabilityDocument — who gets the description', () => {
    it('serves JSON-LD to a client that asks for it', () => {
        const response = negotiateCapabilityDocument(get(JSONLD))!
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain(JSONLD)
        expect(response.headers.get('vary')).toBe('accept')
    })

    it('names the AC profile on the JSON-LD it serves, as the spec asks', () => {
        const response = negotiateCapabilityDocument(get(JSONLD))!
        expect(response.headers.get('content-type')).toContain('profile="https://www.w3.org/ns/ac.jsonld"')
    })

    it('serves Turtle to a client that asks for it', () => {
        const response = negotiateCapabilityDocument(get(TURTLE))!
        expect(response.headers.get('content-type')).toContain(TURTLE)
    })

    it('honours a profile parameter on the Accept type', () => {
        const response = negotiateCapabilityDocument(get(`${JSONLD}; profile="https://www.w3.org/ns/ac.jsonld"`))!
        expect(response.headers.get('content-type')).toContain(JSONLD)
    })

    it('serves the description when it outranks HTML', () => {
        const response = negotiateCapabilityDocument(get(`${JSONLD}, text/html;q=0.5`))!
        expect(response.headers.get('content-type')).toContain(JSONLD)
    })

    it('honours which RDF format the client actually weighted higher', () => {
        expect(negotiateCapabilityDocument(get(`${JSONLD};q=0.5, ${TURTLE};q=0.9`))!.headers.get('content-type'))
            .toContain(TURTLE)
        expect(negotiateCapabilityDocument(get(`${JSONLD};q=0.9, ${TURTLE};q=0.5`))!.headers.get('content-type'))
            .toContain(JSONLD)
    })

    it('prefers JSON-LD on a tie, the format the spec prefers', () => {
        expect(negotiateCapabilityDocument(get(`${TURTLE}, ${JSONLD}`))!.headers.get('content-type'))
            .toContain(JSONLD)
    })

    it('ignores case and stray whitespace in the header', () => {
        const response = negotiateCapabilityDocument(get(`  APPLICATION/LD+JSON ; Q=1  `))!
        expect(response.headers.get('content-type')).toContain(JSONLD)
    })

    it('treats an unparseable q as the default weight rather than failing', () => {
        const response = negotiateCapabilityDocument(get(`${JSONLD};q=banana, text/html;q=0.5`))!
        expect(response.headers.get('content-type')).toContain(JSONLD)
    })

    it('serves JSON-LD that parses and describes this deployment', async () => {
        const response = negotiateCapabilityDocument(get(JSONLD, 'https://preview.vercel.app/'))!
        const body = JSON.parse(await response.text())
        expect(body['@graph'][0].id).toBe('https://preview.vercel.app/#i')
        expect(response.headers.get('content-location')).toBe('https://preview.vercel.app/')
    })

    it('serves Turtle describing this deployment', async () => {
        const response = negotiateCapabilityDocument(get(TURTLE, 'https://preview.vercel.app/'))!
        expect(await response.text()).toContain('<https://preview.vercel.app/#i> a ac:Application')
    })
})

describe('requestOrigin', () => {
    it('uses the request URL when nothing has been proxied', () => {
        expect(requestOrigin(get(undefined, 'https://happytrack.tim-gent.com/'))).toBe('https://happytrack.tim-gent.com')
    })

    it('prefers the forwarded host, which is the one the client asked for', () => {
        const request = get(undefined, 'https://internal.vercel.internal/', {
            'x-forwarded-host': 'happy-track-git-abc.vercel.app',
            'x-forwarded-proto': 'https',
        })
        expect(requestOrigin(request)).toBe('https://happy-track-git-abc.vercel.app')
    })

    it('keeps the scheme the client used, so localhost stays http', () => {
        const request = get(undefined, 'http://localhost:3000/', {
            'x-forwarded-host': 'localhost:3000',
            'x-forwarded-proto': 'http',
        })
        expect(requestOrigin(request)).toBe('http://localhost:3000')
    })

    it('takes the first hop when a chain of proxies has piled up', () => {
        const request = get(undefined, 'https://internal.vercel.internal/', {
            'x-forwarded-host': 'happy-track.example, internal.vercel.internal',
            'x-forwarded-proto': 'https,http',
        })
        expect(requestOrigin(request)).toBe('https://happy-track.example')
    })

    it('ignores a forwarded host that is not a host at all', () => {
        const request = get(undefined, 'https://happytrack.tim-gent.com/', {
            'x-forwarded-host': 'not a host/../evil',
        })
        expect(requestOrigin(request)).toBe('https://happytrack.tim-gent.com')
    })
})
