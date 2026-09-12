import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { SyncAcrossDevicesPrompt, SYNC_PROMPT_DISMISSED_KEY } from './SyncAcrossDevicesPrompt'

vi.mock('./SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

import { useSolidPod } from './SolidPodContext'

const mockUseSolidPod = vi.mocked(useSolidPod)
const mockLogin = vi.fn()

function mockPod(isLoggedIn: boolean, isReconnecting = false) {
    mockUseSolidPod.mockReturnValue({
        isLoggedIn,
        isReconnecting,
        session: null,
        sessionExpired: false,
        clearSessionExpired: vi.fn(),
        webId: undefined,
        isLoading: false,
        login: mockLogin,
        logout: vi.fn(),
    })
}

describe('SyncAcrossDevicesPrompt', () => {
    beforeEach(() => {
        sessionStorage.clear()
        localStorage.clear()
        vi.clearAllMocks()
    })

    it('nudges logged-out users to sync across devices', () => {
        mockPod(false)

        render(<SyncAcrossDevicesPrompt />)

        expect(screen.getByText(/sync across devices/i)).toBeTruthy()
        expect(screen.getByRole('button', { name: /^sign in$/i })).toBeTruthy()
    })

    it('renders nothing when the user is already logged in', () => {
        mockPod(true)

        const { container } = render(<SyncAcrossDevicesPrompt />)

        expect(container.firstChild).toBeNull()
    })

    it('opens the provider selector from the sign-in link', () => {
        mockPod(false)

        render(<SyncAcrossDevicesPrompt />)
        fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

        expect(screen.getByText(/sync your happies/i)).toBeTruthy()
    })

    it('logs in with the chosen provider', () => {
        mockPod(false)

        render(<SyncAcrossDevicesPrompt />)
        fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
        fireEvent.click(screen.getByLabelText('Inrupt PodSpaces'))

        expect(mockLogin).toHaveBeenCalledWith('https://login.inrupt.com')
    })

    it('stays dismissed for the rest of the session', () => {
        mockPod(false)

        const { unmount } = render(<SyncAcrossDevicesPrompt />)
        fireEvent.click(screen.getByLabelText('Dismiss sync prompt'))

        expect(screen.queryByText(/sync across devices/i)).toBeNull()
        expect(sessionStorage.getItem(SYNC_PROMPT_DISMISSED_KEY)).toBe('true')

        unmount()
        const { container } = render(<SyncAcrossDevicesPrompt />)
        expect(container.firstChild).toBeNull()
    })
    /**
     * Offline is not signed out (#342): nudging a signed-in user to sign in is
     * the app telling them their session is gone when it is not.
     */
    it('stays quiet for a signed-in user whose Pod is out of reach', () => {
        mockPod(false, true)

        const { container } = render(<SyncAcrossDevicesPrompt />)

        expect(container.innerHTML).toBe('')
    })
})
