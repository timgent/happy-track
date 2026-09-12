import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import React from 'react'
import { SolidPodProvider, useSolidPod } from './SolidPodContext'
import { SessionEndedError } from '../services/ResilientSession'
import { ToastProvider } from './ToastContext'
import { rememberedWebId, rememberSignedIn } from '../services/rememberedSession'

/**
 * Offline is not signed out (#342).
 *
 * A cold start with no network cannot make a session live: the refresh needs the
 * provider to answer. Everything the app knew about the user would then be gone
 * until the connection came back, and the app would show its logged-out face —
 * on a phone, where a cold start with no signal is routine, that is what "it
 * logged me out again" turned out to be.
 *
 * The rule these tests encode: while a restorable session is stored on this
 * device, the user is signed in and merely offline. Only the provider ending the
 * grant, or a deliberate sign-out, makes them signed out.
 */

let capturedCallbacks: {
    onSessionStateChange?: (event?: Event) => void
    onSessionExpiration?: (event?: Event) => void
} = {}

let mockIsActive = false
let mockWebId: string | undefined
let mockRestore = vi.fn()
let mockLogout = vi.fn()
let mockHasStoredSession = vi.fn()

vi.mock('../services/ResilientSession', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/ResilientSession')>()
    return {
        ...actual,
        ResilientSession: vi.fn().mockImplementation(function (
            _clientDetails: unknown,
            _database: unknown,
            options: typeof capturedCallbacks,
        ) {
            capturedCallbacks = options ?? {}
            return {
                get isActive() { return mockIsActive },
                get webId() { return mockWebId },
                handleRedirectFromLogin: vi.fn().mockResolvedValue(undefined),
                restore: (...args: unknown[]) => mockRestore(...args),
                login: vi.fn().mockResolvedValue(undefined),
                logout: (...args: unknown[]) => mockLogout(...args),
                authFetch: vi.fn(),
                hasStoredSession: (...args: unknown[]) => mockHasStoredSession(...args),
                needsRenewal: vi.fn().mockReturnValue(false),
                scheduleRenewal: vi.fn(),
                cancelRenewal: vi.fn(),
                getExpiresIn: () => 3600,
                isExpired: () => false,
            }
        }),
    }
})

vi.mock('@uvdsl/solid-oidc-client-browser', () => ({
    SessionIDB: vi.fn().mockImplementation(function () { return {} }),
}))

const WEB_ID = 'https://user.example.org/profile/card#me'

function Consumer() {
    const { isLoggedIn, isReconnecting, sessionExpired, webId, logout } = useSolidPod()
    return (
        <div>
            <span data-testid="isLoggedIn">{String(isLoggedIn)}</span>
            <span data-testid="isReconnecting">{String(isReconnecting)}</span>
            <span data-testid="sessionExpired">{String(sessionExpired)}</span>
            <span data-testid="webId">{webId ?? 'none'}</span>
            <button onClick={() => void logout()}>Log out</button>
        </div>
    )
}

function renderApp() {
    return render(
        <ToastProvider>
            <SolidPodProvider><Consumer /></SolidPodProvider>
        </ToastProvider>
    )
}

function activateSession() {
    mockIsActive = true
    mockWebId = WEB_ID
    capturedCallbacks.onSessionStateChange?.(
        new CustomEvent('sessionStateChange', { detail: { isActive: true, webId: WEB_ID } })
    )
}

const state = (id: string) => screen.getByTestId(id).textContent

describe('SolidPodContext — offline is not signed out', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        capturedCallbacks = {}
        mockIsActive = false
        mockWebId = undefined
        mockRestore = vi.fn().mockResolvedValue(undefined)
        mockLogout = vi.fn().mockResolvedValue(undefined)
        mockHasStoredSession = vi.fn().mockResolvedValue(true)
        sessionStorage.clear()
        localStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        sessionStorage.clear()
        localStorage.clear()
    })

    it('reports a stored session it cannot reach as reconnecting, not signed out', async () => {
        rememberSignedIn(WEB_ID)
        mockRestore.mockRejectedValue(new Error('Failed to fetch'))

        renderApp()

        await waitFor(() => expect(state('isReconnecting')).toBe('true'))
        expect(state('isLoggedIn')).toBe('false')
        expect(state('sessionExpired')).toBe('false')
        // Who they are is remembered, so the app can still show whose data it holds.
        expect(state('webId')).toBe(WEB_ID)
    })

    it('does not claim to be reconnecting when no session is stored', async () => {
        mockHasStoredSession = vi.fn().mockResolvedValue(false)

        renderApp()

        await waitFor(() => expect(state('isReconnecting')).toBe('false'))
        expect(state('webId')).toBe('none')
    })

    it('stops reconnecting, and forgets the identity, when the provider ends the session', async () => {
        rememberSignedIn(WEB_ID)
        mockRestore.mockRejectedValue(new SessionEndedError('invalid_grant'))

        renderApp()

        await waitFor(() => expect(state('sessionExpired')).toBe('false'))
        await act(async () => {
            capturedCallbacks.onSessionExpiration?.(new CustomEvent('sessionExpiration'))
        })

        expect(state('isReconnecting')).toBe('false')
        expect(state('sessionExpired')).toBe('true')
        expect(state('webId')).toBe('none')
        expect(rememberedWebId()).toBeUndefined()
    })

    it('remembers the identity once a session goes live, and stops reconnecting', async () => {
        mockRestore.mockRejectedValue(new Error('Failed to fetch'))
        renderApp()
        await waitFor(() => expect(state('isReconnecting')).toBe('true'))

        await act(async () => { activateSession() })

        expect(state('isLoggedIn')).toBe('true')
        expect(state('isReconnecting')).toBe('false')
        expect(rememberedWebId()).toBe(WEB_ID)
    })

    it('forgets the identity on a deliberate sign-out', async () => {
        renderApp()
        await act(async () => { activateSession() })
        expect(rememberedWebId()).toBe(WEB_ID)

        await act(async () => { screen.getByText('Log out').click() })

        await waitFor(() => expect(state('isLoggedIn')).toBe('false'))
        expect(state('isReconnecting')).toBe('false')
        expect(rememberedWebId()).toBeUndefined()
    })

    /**
     * The mid-session case: the access token lapses while the radio is down, so
     * the library flips the session inactive without the provider having said
     * anything. Nothing used to book a retry for that — the recovery backoff only
     * covers a session that was never restored — so the app went quiet, looking
     * signed out.
     */
    it('keeps trying when a live session goes inactive without the provider ending it', async () => {
        renderApp()
        await act(async () => { activateSession() })
        mockRestore.mockClear()
        mockRestore.mockRejectedValue(new Error('Failed to fetch'))

        await act(async () => {
            mockIsActive = false
            capturedCallbacks.onSessionStateChange?.(
                new CustomEvent('sessionStateChange', { detail: { isActive: false, webId: undefined } })
            )
        })

        await waitFor(() => expect(state('isReconnecting')).toBe('true'))
        expect(state('sessionExpired')).toBe('false')
        expect(state('webId')).toBe(WEB_ID)
        expect(mockRestore).toHaveBeenCalled()
    })
})
