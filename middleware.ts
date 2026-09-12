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
import { next } from '@vercel/functions'
import { negotiateCapabilityDocument } from './src/capability/negotiate'

export const config = { matcher: '/' }

export default function middleware(request: Request): Response {
    return negotiateCapabilityDocument(request) ?? next()
}
