import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { OfflineBanner } from './OfflineBanner'

vi.mock('./SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

import { useSolidPod } from './SolidPodContext'

const mockUseSolidPod = vi.mocked(useSolidPod)

function mockPod(overrides: { isLoggedIn?: boolean; isReconnecting?: boolean } = {}) {
    mockUseSolidPod.mockReturnValue({
        session: null,
        isLoggedIn: overrides.isLoggedIn ?? false,
        isReconnecting: overrides.isReconnecting ?? false,
        sessionExpired: false,
        clearSessionExpired: vi.fn(),
        webId: undefined,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
    })
}

function setOnLine(value: boolean) {
    Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

describe('OfflineBanner', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setOnLine(true)
    })

    afterEach(() => {
        setOnLine(true)
    })

    it('says nothing while the session is live', () => {
        mockPod({ isLoggedIn: true })

        const { container } = render(<OfflineBanner />)

        expect(container.innerHTML).toBe('')
    })

    it('says nothing to someone who is not signed in', () => {
        mockPod()

        const { container } = render(<OfflineBanner />)

        expect(container.innerHTML).toBe('')
    })

    // The whole point of #342: reassurance, not an alarm. It must say the lists
    // are still here and that changes are not being thrown away.
    it('reassures a signed-in user whose device is offline', () => {
        mockPod({ isReconnecting: true })
        setOnLine(false)

        render(<OfflineBanner />)

        expect(screen.getByRole('status').textContent).toMatch(/offline/i)
        expect(screen.getByRole('status').textContent).toMatch(/sync/i)
    })

    // Online but still unable to reach the provider — a pod that is down, a
    // captive portal. Telling this user "you're offline" would be a lie.
    it('names the Pod, not the connection, when the device is online', () => {
        mockPod({ isReconnecting: true })
        setOnLine(true)

        render(<OfflineBanner />)

        const text = screen.getByRole('status').textContent ?? ''
        expect(text).toMatch(/reconnecting/i)
        expect(text).not.toMatch(/you're offline/i)
    })
})
