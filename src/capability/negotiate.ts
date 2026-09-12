/**
 * Content negotiation for the Application Capability description at "/".
 *
 * A browser keeps getting the SPA. A client that explicitly asks for
 * `application/ld+json` or `text/turtle`, and weights it above `text/html`,
 * gets the description instead (./document.ts). /middleware.ts is the Vercel
 * edge shell around this; the deciding is all here so it can be tested without
 * a deployment, which is the only place middleware actually runs.
 *
 * Two rules do most of the work:
 *
 * - Only an exact, named entry counts as asking for RDF. A catch-all wildcard
 *   — every plain `curl /`, and every request with no Accept header at all —
 *   must not be enough, or the homepage stops being the homepage.
 * - HTML wins ties. `Accept: application/ld+json, text/html` (both q=1) is far
 *   more likely to be a link-preview bot or an SDK default than a deliberate
 *   ask for RDF, and the cost of getting it wrong is a blank page for a human.
 */
import { capabilityDescription } from './document'

const JSONLD_TYPE = 'application/ld+json'
const TURTLE_TYPE = 'text/turtle'
const HTML_TYPE = 'text/html'

/** The spec's context IRI doubles as its conneg profile — §2.3. */
const AC_PROFILE = 'https://www.w3.org/ns/ac.jsonld'

interface AcceptEntry {
    type: string
    q: number
}

function parseAccept(header: string | null): AcceptEntry[] {
    if (!header) return [{ type: '*/*', q: 1 }]
    return header.split(',').map(part => {
        // Parameters after the media type (`;q=`, `;profile=`) are dropped: the
        // media type alone decides, and a profile parameter narrows an ask we
        // already answer.
        const [type, ...params] = part.trim().split(';').map(s => s.trim())
        const qParam = params.find(p => p.toLowerCase().startsWith('q='))
        const q = qParam ? parseFloat(qParam.slice(2)) : 1
        return { type: type.toLowerCase(), q: Number.isFinite(q) ? q : 1 }
    })
}

/** The weight the client put on `mediaType`, wildcards included. */
function qualityFor(entries: AcceptEntry[], mediaType: string): number {
    const [maintype] = mediaType.split('/')
    let best = 0
    for (const entry of entries) {
        if (entry.type === mediaType || entry.type === `${maintype}/*` || entry.type === '*/*') {
            if (entry.q > best) best = entry.q
        }
    }
    return best
}

/** The weight the client put on `mediaType` by name — no wildcard credit. */
function explicitQualityFor(entries: AcceptEntry[], mediaType: string): number {
    let best = 0
    for (const entry of entries) {
        if (entry.type === mediaType && entry.q > best) best = entry.q
    }
    return best
}

/** Reject anything that isn't a bare host[:port] before trusting it. */
const HOST = /^[a-z0-9.-]+(:\d+)?$/i

/**
 * The origin the client actually addressed, so a preview deployment describes
 * itself and localhost describes localhost. Vercel terminates TLS and proxies,
 * so the request URL's own host is an internal one; the forwarded headers carry
 * what the client asked for. Both can be comma-separated chains — the first hop
 * is the client-facing one.
 */
export function requestOrigin(request: Request): string {
    const url = new URL(request.url)
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim()
    if (!forwardedHost || !HOST.test(forwardedHost)) return url.origin

    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim()
    const protocol = forwardedProto === 'http' || forwardedProto === 'https'
        ? forwardedProto
        : url.protocol.replace(':', '')

    return `${protocol}://${forwardedHost}`
}

/**
 * The capability description this request asked for, or null to let the SPA
 * answer.
 */
export function negotiateCapabilityDocument(request: Request): Response | null {
    const entries = parseAccept(request.headers.get('accept'))
    const jsonldQ = explicitQualityFor(entries, JSONLD_TYPE)
    const turtleQ = explicitQualityFor(entries, TURTLE_TYPE)
    const htmlQ = qualityFor(entries, HTML_TYPE)

    // Strictly greater than HTML, so a tie hands over the app. Between the two
    // RDF formats a tie goes to JSON-LD, the format the spec prefers.
    const wantsJsonld = jsonldQ > 0 && jsonldQ > htmlQ && jsonldQ >= turtleQ
    const wantsTurtle = turtleQ > 0 && turtleQ > htmlQ
    if (!wantsJsonld && !wantsTurtle) return null

    const origin = requestOrigin(request)
    const description = capabilityDescription(origin)

    const headers = (contentType: string) => ({
        'content-type': contentType,
        // The description is what lives at "/" for this client, and this is the
        // IRI its relative fragments resolve against.
        'content-location': `${origin}/`,
        vary: 'accept',
    })

    if (wantsJsonld) {
        return new Response(JSON.stringify(description.jsonld, null, 2), {
            headers: headers(`${JSONLD_TYPE}; charset=utf-8; profile="${AC_PROFILE}"`),
        })
    }

    return new Response(description.turtle, {
        headers: headers(`${TURTLE_TYPE}; charset=utf-8`),
    })
}
