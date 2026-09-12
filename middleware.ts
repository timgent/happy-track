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
// Two things about the imports below, both learned from a deployment that
// answered every request to "/" with 500 MIDDLEWARE_INVOCATION_FAILED:
//
// - **Relative imports need the `.js`.** Vercel does not bundle middleware. It
//   compiles each `.ts` file to a `.js` file beside it and ships them, and the
//   Edge runtime resolves the imports at runtime, where `./src/capability/
//   negotiate` is not a module specifier that resolves to anything. The module
//   then fails to instantiate before the handler is ever called, so the
//   homepage 500s for everyone — not only for the clients asking for RDF. The
//   `.js` points at the emitted file, and TypeScript resolves it back to the
//   `.ts` (this is the same convention Node's own ESM needs). The rule applies
//   to every file this one reaches, hence `negotiate.ts` importing
//   `./document.js` — `tsconfig.middleware.json` resolves the way Vercel's
//   compile does so `npm run typecheck` fails on a missing extension.
// - **`next` comes from `@vercel/functions/middleware`, not the package root.**
//   The root re-exports the whole package, including helpers written for the
//   Node.js runtime — `attachDatabasePool`'s module reads `process.env` as it is
//   evaluated, and the Edge runtime has no `process`. The `/middleware` entry is
//   `next` and `rewrite` and nothing else. `middleware.test.ts` runs this file
//   in a real Edge sandbox, so a Node-only import fails `npm test` instead.
import { next } from '@vercel/functions/middleware'
import { negotiateCapabilityDocument } from './src/capability/negotiate.js'

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
