import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
    rememberedWebId,
    rememberSignedIn,
    forgetSignedIn,
    rememberedPodNamespace,
    rememberPodNamespace,
} from './rememberedSession'

const WEB_ID = 'https://user.example.org/profile/card#me'
const OTHER_WEB_ID = 'https://other.example.org/profile/card#me'

describe('rememberedSession', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        localStorage.clear()
    })

    it('remembers nothing before a session has ever been live', () => {
        expect(rememberedWebId()).toBeUndefined()
        expect(rememberedPodNamespace(WEB_ID)).toBeUndefined()
    })

    it('remembers the signed-in WebID across reloads', () => {
        rememberSignedIn(WEB_ID)

        expect(rememberedWebId()).toBe(WEB_ID)
    })

    it('forgets the WebID once the session is genuinely over', () => {
        rememberSignedIn(WEB_ID)

        forgetSignedIn()

        expect(rememberedWebId()).toBeUndefined()
    })

    it('remembers a pod namespace per identity', () => {
        rememberPodNamespace(WEB_ID, 'pod.example.org_alice')
        rememberPodNamespace(OTHER_WEB_ID, 'pod.example.org_bob')

        expect(rememberedPodNamespace(WEB_ID)).toBe('pod.example.org_alice')
        expect(rememberedPodNamespace(OTHER_WEB_ID)).toBe('pod.example.org_bob')
    })

    // The namespace outlives the session on purpose: it is how the *next* offline
    // start finds the database, and it names no secret. Only the identity is
    // forgotten at sign-out.
    it('keeps the namespace when the identity is forgotten', () => {
        rememberSignedIn(WEB_ID)
        rememberPodNamespace(WEB_ID, 'pod.example.org_alice')

        forgetSignedIn()

        expect(rememberedPodNamespace(WEB_ID)).toBe('pod.example.org_alice')
    })

    it('survives storage that throws instead of storing', () => {
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError')
        })
        vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError')
        })

        expect(() => rememberSignedIn(WEB_ID)).not.toThrow()
        expect(() => rememberPodNamespace(WEB_ID, 'ns')).not.toThrow()
        expect(rememberedWebId()).toBeUndefined()
        expect(rememberedPodNamespace(WEB_ID)).toBeUndefined()
    })
})
