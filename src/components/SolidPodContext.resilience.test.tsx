import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import React from 'react'
import { SolidPodProvider, useSolidPod } from './SolidPodContext'
import { ToastProvider } from './ToastContext'

/**
 * Regression suite for the "logged out for no reason" bug.
 *
 * Every case here is a moment where the *refresh token is still valid* but the app
 * used to drop the session anyway. The rule these tests encode: only the identity
 * provider saying "this refresh token is dead" may end a session. Nothing else —
 * not a flaky network, not a cold start, not one 401 — may log the user out, and
 * nothing but a deliberate logout may erase the stored refresh token.
 */

let capturedCallbacks: {
    onSessionStateChange?: (event?: Event) => void
    onSessionExpiration?: (event?: Event) => void
} = {}

let mockIsActive = false
let mockWebId: string | undefined
let mockAuthFetch = vi.fn()
let mockRestore = vi.fn()
let mockLogout = vi.fn()

let mockHasStoredSession = vi.fn()
let mockNeedsRenewal = vi.fn()

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
                authFetch: (...args: unknown[]) => mockAuthFetch(...args),
                hasStoredSession: (...args: unknown[]) => mockHasStoredSession(...args),
                needsRenewal: (...args: unknown[]) => mockNeedsRenewal(...args),
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
    const { isLoggedIn, sessionExpired } = useSolidPod()
    return (
        <div>
            <span data-testid="isLoggedIn">{String(isLoggedIn)}</span>
            <span data-testid="sessionExpired">{String(sessionExpired)}</span>
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

/** Drives the library's own "session became active" callback, as a real restore would. */
function activateSession() {
    mockIsActive = true
    mockWebId = WEB_ID
    capturedCallbacks.onSessionStateChange?.(
        new CustomEvent('sessionStateChange', { detail: { isActive: true, webId: WEB_ID } })
    )
}

async function becomeVisible() {
    await act(async () => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
    })
}

describe('SolidPodContext — staying logged in', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        capturedCallbacks = {}
        mockIsActive = false
        mockWebId = undefined
        mockAuthFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
        mockRestore = vi.fn().mockResolvedValue(undefined)
        mockLogout = vi.fn().mockResolvedValue(undefined)
        // A stored refresh token exists unless a test says otherwise.
        mockHasStoredSession = vi.fn().mockResolvedValue(true)
        mockNeedsRenewal = vi.fn().mockReturnValue(false)
        sessionStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        sessionStorage.clear()
    })

    it('retries a restore that failed on startup, rather than starting up logged out', async () => {
        // A cold start on mobile routinely beats the network to the punch: the refresh
        // POST fails, but the refresh token in IndexedDB is untouched and still good.
        mockRestore = vi.fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockImplementation(async () => { activateSession() })

        renderApp()

        await waitFor(
            () => expect(screen.getByTestId('isLoggedIn').textContent).toBe('true'),
            { timeout: 10_000 }
        )
    }, 15_000)

    it('does not tell the user their session expired when a refresh merely failed', async () => {
        // ResilientSession reserves the expiration callback for a provider that has
        // actually rejected the grant. Anything it hands back as a plain rejection is
        // still recoverable, and must not surface as "your session has expired".
        mockRestore = vi.fn().mockRejectedValue(new Error('Could not reach the token endpoint'))

        renderApp()

        await waitFor(() => expect(mockRestore).toHaveBeenCalled(), { timeout: 10_000 })
        expect(screen.getByTestId('sessionExpired').textContent).toBe('false')
    }, 15_000)

    it('reports an expired session only when the provider rejects the grant', async () => {
        renderApp()
        await act(async () => { activateSession() })
        await waitFor(() => expect(screen.getByTestId('isLoggedIn').textContent).toBe('true'))

        await act(async () => {
            mockIsActive = false
            mockWebId = undefined
            capturedCallbacks.onSessionExpiration?.()
        })

        await waitFor(() => {
            expect(screen.getByTestId('isLoggedIn').textContent).toBe('false')
            expect(screen.getByTestId('sessionExpired').textContent).toBe('true')
        })
    }, 15_000)

    it('never erases the stored refresh token when the pod answers 401', async () => {
        renderApp()
        await act(async () => { activateSession() })
        await waitFor(() => expect(screen.getByTestId('isLoggedIn').textContent).toBe('true'))

        // The app used to probe the WebID on tab focus and, on a 401, call the
        // library's logout() — which clears IndexedDB and takes the refresh token
        // with it, turning an ageing access token into a mandatory re-login.
        mockAuthFetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))

        await becomeVisible()
        await new Promise(r => setTimeout(r, 50))

        expect(mockLogout).not.toHaveBeenCalled()
        expect(screen.getByTestId('sessionExpired').textContent).toBe('false')
    }, 15_000)

    it('renews on tab focus while the token is still valid, not after it has lapsed', async () => {
        // Waiting for `exp` to pass means every request in the final moments races
        // the expiry boundary, and any clock skew loses that race.
        renderApp()
        await act(async () => { activateSession() })
        await waitFor(() => expect(screen.getByTestId('isLoggedIn').textContent).toBe('true'))

        mockRestore = vi.fn().mockResolvedValue(undefined)
        mockNeedsRenewal = vi.fn().mockReturnValue(true)

        await becomeVisible()

        await waitFor(() => expect(mockRestore).toHaveBeenCalled(), { timeout: 10_000 })
    }, 15_000)

    it('still reports a later genuine expiry after a deliberate logout', async () => {
        // The "this logout was intentional" flag used to stay set, so the first
        // real expiry after a manual sign-out passed silently.
        function Actions() {
            const { logout } = useSolidPod()
            return <button onClick={() => { void logout() }}>logout</button>
        }

        render(
            <ToastProvider>
                <SolidPodProvider><Consumer /><Actions /></SolidPodProvider>
            </ToastProvider>
        )

        await act(async () => { activateSession() })
        await waitFor(() => expect(screen.getByTestId('isLoggedIn').textContent).toBe('true'))

        await act(async () => { screen.getByRole('button', { name: 'logout' }).click() })
        await waitFor(() => expect(screen.getByTestId('sessionExpired').textContent).toBe('false'))

        await act(async () => { activateSession() })
        await waitFor(() => expect(screen.getByTestId('isLoggedIn').textContent).toBe('true'))

        await act(async () => {
            mockIsActive = false
            mockWebId = undefined
            capturedCallbacks.onSessionExpiration?.()
        })

        await waitFor(() => expect(screen.getByTestId('sessionExpired').textContent).toBe('true'))
    }, 15_000)
})
