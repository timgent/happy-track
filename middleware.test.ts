// @vitest-environment node
/**
 * /middleware.ts, run the way Vercel runs it.
 *
 * The middleware's own decisions are tested in src/capability/negotiate.test.ts
 * against plain Requests in Node. That is not enough to keep the homepage up:
 * middleware is bundled and evaluated on the Edge runtime, which is neither
 * Node nor a browser, and a module that touches a Node global blows up as it is
 * *loaded* — before the handler runs, so every request to "/" 500s with
 * MIDDLEWARE_INVOCATION_FAILED, RDF or not. That is what importing `next` from
 * the `@vercel/functions` package root did: the root pulls in the package's
 * Node-runtime helpers, one of which reads `process.env` at module scope.
 *
 * So this bundles the real file the way Vercel's builder does and evaluates it
 * in a real Edge sandbox (`@edge-runtime/vm`, the same runtime `vercel dev`
 * uses), which has no `process`, no `require` and no Node builtins. An import
 * that cannot survive the Edge runtime fails `npm test` instead of the
 * deployment.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { EdgeVM } from '@edge-runtime/vm'

const ORIGIN = 'https://happy-track.vercel.app'
const CHROME_ACCEPT =
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'

let vm: EdgeVM

/** What the sandbox answered, flattened so it survives the VM boundary. */
interface Answered {
    status: number
    contentType: string | null
    /** `x-middleware-next: 1` is how a middleware says "carry on to the app". */
    continues: boolean
    body: string
}

async function bundleForTheEdge(): Promise<string> {
    const result = await build({
        entryPoints: [fileURLToPath(new URL('./middleware.ts', import.meta.url))],
        bundle: true,
        write: false,
        // An IIFE rather than ESM only so the sandbox can evaluate it as a
        // script and reach the handler; everything else matches an Edge build —
        // no Node platform, and the export conditions Edge bundles resolve.
        format: 'iife',
        globalName: 'middlewareModule',
        platform: 'browser',
        conditions: ['edge-light', 'worker', 'browser'],
        target: 'es2022',
    })
    return result.outputFiles[0].text
}

/** Ask the sandboxed middleware for "/" the way a client with this Accept would. */
async function ask(accept?: string): Promise<Answered> {
    const headers = {
        ...(accept === undefined ? {} : { accept }),
        // Vercel terminates TLS and proxies, so this is how the origin arrives.
        'x-forwarded-host': 'happy-track.vercel.app',
        'x-forwarded-proto': 'https',
    }
    return await vm.evaluate(`(async () => {
        const response = middlewareModule.default(
            new Request('${ORIGIN}/', { headers: ${JSON.stringify(headers)} })
        )
        return {
            status: response.status,
            contentType: response.headers.get('content-type'),
            continues: response.headers.get('x-middleware-next') === '1',
            body: await response.text(),
        }
    })()`)
}

describe('middleware on the Edge runtime', () => {
    beforeAll(async () => {
        const bundle = await bundleForTheEdge()
        vm = new EdgeVM()
        // The sandbox is the point: if this ever starts reporting "object" the
        // test has stopped proving anything.
        expect(vm.evaluate('typeof process')).toBe('undefined')
        // Evaluating is what a deployment does on the first request, and it is
        // where a Node-only import throws.
        expect(() => vm.evaluate(bundle)).not.toThrow()
    }, 60_000)

    it('hands a browser on to the app', async () => {
        const answered = await ask(CHROME_ACCEPT)
        expect(answered.continues).toBe(true)
        expect(answered.body).toBe('')
    })

    it('hands a request with no Accept header on to the app', async () => {
        expect((await ask()).continues).toBe(true)
    })

    it('answers an ask for JSON-LD with the capability description', async () => {
        const answered = await ask('application/ld+json')
        expect(answered.continues).toBe(false)
        expect(answered.contentType).toContain('application/ld+json')
        // Built from the forwarded host, not from the URL the request arrived
        // on inside Vercel's network.
        const described = JSON.parse(answered.body) as { '@graph': { id: string }[] }
        expect(described['@graph'].map(node => node.id)).toContain(`${ORIGIN}/#i`)
    })

    it('answers an ask for Turtle with the capability description', async () => {
        const answered = await ask('text/turtle')
        expect(answered.continues).toBe(false)
        expect(answered.contentType).toContain('text/turtle')
        expect(answered.body).toContain(`<${ORIGIN}/#i>`)
    })

    it('runs the matcher on "/" alone, so nothing else pays for this', async () => {
        const { config } = await import('./middleware')
        expect(config.matcher).toBe('/')
    })
})
