// Vercel Edge Middleware: content negotiation at "/". A real browser (or
// anything asking for text/html) keeps getting the SPA; a client that explicitly
// asks for application/ld+json or text/turtle, and weights it above text/html,
// gets the app's Application Capability description instead
// (https://dokieli.github.io/application-capability/).
//
// Everything this decides lives in src/capability/negotiate.ts, so it is unit
// tested by `npm test`. This file is deliberately thin, because middleware only
// ever runs on Vercel: under `npm run dev`, `vite preview` and the Capacitor
// builds it does nothing at all.
//
// It is type-checked by tsconfig.middleware.json, which tsconfig.json
// references, so `npm run typecheck` — and therefore `npm test` and CI — covers
// it. It sits outside src/ because that is where Vercel looks for it.
//
// `next` comes from the `/middleware` entry point and not from the package
// root: the root re-exports the whole of `@vercel/functions`, including helpers
// written for the Node.js runtime (`attachDatabasePool` reads `process.env` as
// its module is evaluated). Middleware runs on the Edge runtime, which has no
// Node globals, so importing the root threw `ReferenceError: process is not
// defined` before the handler was ever called — every request to "/" was a 500
// (MIDDLEWARE_INVOCATION_FAILED), not just the ones asking for RDF.
// `middleware.test.ts` runs this file in a real Edge sandbox so a regression
// fails `npm test` rather than the deployment.
import { next } from '@vercel/functions/middleware'
import { negotiateCapabilityDocument } from './src/capability/negotiate'

export const config = { matcher: '/' }

export default function middleware(request: Request): Response {
    // The description is an extra this route can do without; the SPA is not.
    // Anything unexpected in here would otherwise take the homepage down with
    // it, so a throw serves the app and loses only the negotiation.
    try {
        return negotiateCapabilityDocument(request) ?? next()
    } catch {
        return next()
    }
}
