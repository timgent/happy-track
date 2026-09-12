import { describe, it, expect } from 'vitest'
import {
    installOpenInvocationHandler,
    parseOpenInvocation,
    resolveHappyTrackResource,
    openInvocationPath,
    rewriteOpenInvocationHash,
} from './openInvocation'

const POD = 'https://alice.solidcommunity.example/'
const MONTH_IRI = `${POD}happy-track/months/2026-09.ttl`
const SETTINGS_IRI = `${POD}happy-track/settings.ttl`

describe('parseOpenInvocation', () => {
    it('reads the spec\'s query-form open variable out of the fragment', () => {
        expect(parseOpenInvocation(`#open=${encodeURIComponent(MONTH_IRI)}`)).toBe(MONTH_IRI)
    })

    it('accepts a value a consumer left un-encoded', () => {
        expect(parseOpenInvocation(`#open=${MONTH_IRI}`)).toBe(MONTH_IRI)
    })

    it('ignores variables it does not recognise rather than failing', () => {
        const hash = `#login=${encodeURIComponent('https://alice.example/#me')}&open=${encodeURIComponent(MONTH_IRI)}&output=text%2Fhtml`
        expect(parseOpenInvocation(hash)).toBe(MONTH_IRI)
    })

    it('takes the first value when open is repeated, since the app opens one resource', () => {
        const hash = `#open=${encodeURIComponent(MONTH_IRI)}&open=${encodeURIComponent(SETTINGS_IRI)}`
        expect(parseOpenInvocation(hash)).toBe(MONTH_IRI)
    })

    it('does not treat ";" as a separator, as the spec requires', () => {
        // The whole tail is part of the open value, so it is no longer the IRI
        // of anything this app stores and nothing is opened.
        const hash = `#open=${encodeURIComponent(MONTH_IRI)};login=whoever`
        expect(parseOpenInvocation(hash)).toBe(`${MONTH_IRI};login=whoever`)
        expect(resolveHappyTrackResource(parseOpenInvocation(hash)!)).toBeNull()
    })

    it('leaves the app\'s own hash routes alone', () => {
        expect(parseOpenInvocation('#/journal/2026-09')).toBeNull()
        expect(parseOpenInvocation('#/settings')).toBeNull()
        expect(parseOpenInvocation('')).toBeNull()
        expect(parseOpenInvocation('#')).toBeNull()
    })

    it('reports an empty or undecodable value as present but unusable', () => {
        // Not null: the invocation was made, so the app owes the person an
        // explanation rather than a blank page.
        expect(parseOpenInvocation('#open=')).toBe('')
        expect(parseOpenInvocation('#open=%E0%A4%A')).toBe('')
    })

    it('reports no invocation at all when there is no open variable', () => {
        expect(parseOpenInvocation('#open')).toBeNull()
        expect(parseOpenInvocation('#login=whoever')).toBeNull()
    })
})

describe('resolveHappyTrackResource', () => {
    it('recognises a month by where the app stores it', () => {
        expect(resolveHappyTrackResource(MONTH_IRI)).toEqual({
            kind: 'month',
            podUrl: POD,
            monthKey: '2026-09',
        })
    })

    it('recognises the settings document', () => {
        expect(resolveHappyTrackResource(SETTINGS_IRI)).toEqual({
            kind: 'settings',
            podUrl: POD,
        })
    })

    it('does not claim resources this app knows nothing about', () => {
        expect(resolveHappyTrackResource(`${POD}notes/shopping.ttl`)).toBeNull()
        expect(resolveHappyTrackResource(`${POD}happy-track/backups/2026-01-01.ttl`)).toBeNull()
        expect(resolveHappyTrackResource(`${POD}happy-track/months/`)).toBeNull()
    })

    it('refuses a filename that is not a month key', () => {
        // The key goes straight into a route, so anything that is not a month
        // must be refused here rather than routed to /journal/<whatever>.
        expect(resolveHappyTrackResource(`${POD}happy-track/months/September.ttl`)).toBeNull()
        expect(resolveHappyTrackResource(`${POD}happy-track/months/2026-13.ttl`)).toBeNull()
        expect(resolveHappyTrackResource(`${POD}happy-track/months/..%2F..%2Fetc.ttl`)).toBeNull()
    })

    it('refuses schemes an invocation must never navigate to', () => {
        expect(resolveHappyTrackResource('javascript:alert(1)')).toBeNull()
        expect(resolveHappyTrackResource('data:text/html,<script>')).toBeNull()
        expect(resolveHappyTrackResource('file:///etc/passwd')).toBeNull()
        expect(resolveHappyTrackResource('not-an-iri')).toBeNull()
        expect(resolveHappyTrackResource('')).toBeNull()
    })
})

describe('openInvocationPath', () => {
    it('opens a month on your own pod in your journal', () => {
        expect(openInvocationPath(MONTH_IRI, POD)).toBe('/journal/2026-09')
    })

    it('opens your own settings document on the settings page', () => {
        expect(openInvocationPath(SETTINGS_IRI, POD)).toBe('/settings')
    })

    it("refuses a resource in somebody else's pod", () => {
        // Happy Track has no viewer for another person's journal, so routing
        // this anywhere would be advertising a capability it does not have.
        expect(openInvocationPath(MONTH_IRI, 'https://bob.example/')).toBeNull()
    })

    it('refuses anything at all when we do not yet know your own pod', () => {
        expect(openInvocationPath(MONTH_IRI, null)).toBeNull()
    })

    it('has no path for a resource it does not recognise', () => {
        expect(openInvocationPath(`${POD}notes/shopping.ttl`, POD)).toBeNull()
    })
})

describe('rewriteOpenInvocationHash', () => {
    it('turns an invocation fragment into a route the app can actually navigate', () => {
        expect(rewriteOpenInvocationHash(`#open=${encodeURIComponent(MONTH_IRI)}`)).toBe(
            `#/open?resource=${encodeURIComponent(MONTH_IRI)}`
        )
    })

    it('leaves anything that is not an invocation untouched', () => {
        expect(rewriteOpenInvocationHash('#/journal/2026-09')).toBeNull()
        expect(rewriteOpenInvocationHash('#/settings')).toBeNull()
        expect(rewriteOpenInvocationHash('')).toBeNull()
    })

    it('routes an invocation the app will refuse, so the refusal has somewhere to be said', () => {
        expect(rewriteOpenInvocationHash('#open=javascript:alert(1)')).toBe(
            `#/open?resource=${encodeURIComponent('javascript:alert(1)')}`
        )
        expect(rewriteOpenInvocationHash('#open=')).toBe('#/open?resource=')
    })
})

describe('installOpenInvocationHandler', () => {
    it('rewrites an invocation already in the address bar before the router sees it', () => {
        window.location.hash = `#open=${encodeURIComponent(MONTH_IRI)}`

        installOpenInvocationHandler(window)

        expect(window.location.hash).toBe(`#/open?resource=${encodeURIComponent(MONTH_IRI)}`)
    })

    it('rewrites an invocation that arrives while the app is already open', () => {
        window.location.hash = '#/journal'
        installOpenInvocationHandler(window)

        window.location.hash = `#open=${encodeURIComponent(SETTINGS_IRI)}`
        window.dispatchEvent(new window.HashChangeEvent('hashchange'))

        expect(window.location.hash).toBe(`#/open?resource=${encodeURIComponent(SETTINGS_IRI)}`)
    })

    it('also catches the popstate a fragment change fires, which is what the router listens on', () => {
        window.location.hash = '#/journal'
        installOpenInvocationHandler(window)

        window.location.hash = `#open=${encodeURIComponent(MONTH_IRI)}`
        window.dispatchEvent(new window.PopStateEvent('popstate'))

        expect(window.location.hash).toBe(`#/open?resource=${encodeURIComponent(MONTH_IRI)}`)
    })

    it('tells the router to look again once it has rewritten the fragment', () => {
        window.location.hash = '#/journal'
        installOpenInvocationHandler(window)

        const seen: string[] = []
        window.addEventListener('popstate', () => seen.push(window.location.hash))

        window.location.hash = `#open=${encodeURIComponent(MONTH_IRI)}`
        window.dispatchEvent(new window.HashChangeEvent('hashchange'))

        expect(seen).toContain(`#/open?resource=${encodeURIComponent(MONTH_IRI)}`)
    })

    it('leaves ordinary navigation alone', () => {
        window.location.hash = '#/settings'

        installOpenInvocationHandler(window)

        expect(window.location.hash).toBe('#/settings')
    })
})
