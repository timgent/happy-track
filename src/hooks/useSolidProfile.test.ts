import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { AppSession } from '../types/AppSession'
import { profileDisplayName, useSolidProfile } from './useSolidProfile'

// podUsernameFromWebId stays real: the fallback these tests assert on should be
// the fallback that ships.
vi.mock('../services/solidPod', async importOriginal => ({
    ...(await importOriginal<typeof import('../services/solidPod')>()),
    getSolidProfile: vi.fn(),
}))

import { getSolidProfile } from '../services/solidPod'

const mockGetSolidProfile = vi.mocked(getSolidProfile)

const session = { fetch: globalThis.fetch, info: { isLoggedIn: true } } as AppSession

describe('useSolidProfile', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('reports nothing until the profile card has been read', () => {
        mockGetSolidProfile.mockReturnValue(new Promise(() => {}))

        const { result } = renderHook(() => useSolidProfile('https://alice.example/profile/card#me', session))

        expect(result.current).toEqual({ name: null, photo: null })
    })

    it('reports the name and photo the card names', async () => {
        mockGetSolidProfile.mockResolvedValue({ name: 'Alice', photo: 'https://alice.example/me.png' })

        const { result } = renderHook(() => useSolidProfile('https://alice.example/profile/card#me', session))

        await waitFor(() => expect(result.current).toEqual({ name: 'Alice', photo: 'https://alice.example/me.png' }))
    })

    it('reads nothing when there is no WebID to read', () => {
        renderHook(() => useSolidProfile(undefined, session))

        expect(mockGetSolidProfile).not.toHaveBeenCalled()
    })

    // A profile card is public by convention, and getSolidProfile reads it
    // unauthenticated when there is no session — same as usePersonPhotos.
    it('still reads the card when there is no session', async () => {
        mockGetSolidProfile.mockResolvedValue({ name: 'Alice', photo: null })

        const { result } = renderHook(() => useSolidProfile('https://alice.example/profile/card#me', null))

        await waitFor(() => expect(result.current.name).toBe('Alice'))
        expect(mockGetSolidProfile).toHaveBeenCalledWith(null, 'https://alice.example/profile/card#me')
    })

    it('keeps a card that cannot be read from breaking the caller', async () => {
        mockGetSolidProfile.mockRejectedValue(new Error('404'))

        const { result } = renderHook(() => useSolidProfile('https://gone.example/profile/card#me', session))

        await waitFor(() => expect(mockGetSolidProfile).toHaveBeenCalled())
        expect(result.current).toEqual({ name: null, photo: null })
    })

    it('does not write state for a profile that lands after unmount', async () => {
        let resolve!: (p: { name: string | null; photo: string | null }) => void
        mockGetSolidProfile.mockReturnValue(new Promise(r => { resolve = r }))
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

        const { unmount } = renderHook(() => useSolidProfile('https://alice.example/profile/card#me', session))
        unmount()
        resolve({ name: 'Alice', photo: null })
        await Promise.resolve()

        expect(errors).not.toHaveBeenCalled()
        errors.mockRestore()
    })
})

describe('profileDisplayName', () => {
    const WEB_ID = 'http://localhost:4000/testuser/profile/card#me'

    it('prefers the name the profile card gives', () => {
        expect(profileDisplayName({ name: 'Alice Adams', photo: null }, WEB_ID)).toBe('Alice Adams')
    })

    it('falls back to the username the WebID carries', () => {
        expect(profileDisplayName({ name: null, photo: null }, WEB_ID)).toBe('testuser')
    })

    // Signed in, but the WebID has not landed yet — better than an empty gap.
    it('falls back again when there is no WebID to read', () => {
        expect(profileDisplayName({ name: null, photo: null }, undefined)).toBe('Your account')
    })

    it('falls back again when the WebID cannot be parsed', () => {
        expect(profileDisplayName({ name: null, photo: null }, 'not-a-url')).toBe('Your account')
    })
})
