import { describe, it, expect } from 'vitest'
import { isNeutralAuthReturnRoute, POST_LOGIN_ROUTE } from './postLoginDestination'

describe('isNeutralAuthReturnRoute', () => {
    it.each([null, undefined, '', '/', '/home', '/home/', '/solid-pod-handle-redirect'])(
        'treats %p as a neutral entry point',
        route => {
            expect(isNeutralAuthReturnRoute(route)).toBe(true)
        }
    )

    it.each([
        '/today',
        '/journal',
        '/journal/2026-09',
        '/insights',
        '/settings',
        '/your-data',
    ])('treats %p as a route the user meant to return to', route => {
        expect(isNeutralAuthReturnRoute(route)).toBe(false)
    })

    it('ignores a query string or nested hash when classifying', () => {
        expect(isNeutralAuthReturnRoute('/home?utm=x')).toBe(true)
        expect(isNeutralAuthReturnRoute('/journal?tag=family')).toBe(false)
    })
})

describe('POST_LOGIN_ROUTE', () => {
    it('is Today — the box you are meant to type in', () => {
        expect(POST_LOGIN_ROUTE).toBe('/today')
    })
})
