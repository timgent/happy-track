import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('./SolidPodContext', () => ({
    useSolidPod: vi.fn(),
}))

vi.mock('./SolidProviderSelector', () => ({
    SolidProviderSelector: ({ isOpen }: { isOpen: boolean }) =>
        isOpen ? <div data-testid="provider-selector" /> : null,
}))

import { useSolidPod } from './SolidPodContext'
import { SessionExpiredBanner } from './SessionExpiredBanner'

const mockUseSolidPod = vi.mocked(useSolidPod)

const defaultMock = {
    session: null,
    isLoggedIn: false,
    sessionExpired: false,
    clearSessionExpired: vi.fn(),
    webId: undefined,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
}

describe('SessionExpiredBanner', () => {
    beforeEach(() => {
        mockUseSolidPod.mockReturnValue({ ...defaultMock, clearSessionExpired: vi.fn() })
    })

    it('does not render when sessionExpired is false', () => {
        mockUseSolidPod.mockReturnValue({ ...defaultMock, sessionExpired: false, isLoggedIn: false })

        render(<SessionExpiredBanner />)

        expect(screen.queryByText(/session has expired/i)).toBeNull()
    })

    it('renders the banner when sessionExpired is true and user is not logged in', () => {
        mockUseSolidPod.mockReturnValue({ ...defaultMock, sessionExpired: true, isLoggedIn: false })

        render(<SessionExpiredBanner />)

        expect(screen.getByText(/session has expired/i)).toBeDefined()
    })

    it('does not render when sessionExpired is true but user is logged in', () => {
        mockUseSolidPod.mockReturnValue({ ...defaultMock, sessionExpired: true, isLoggedIn: true })

        render(<SessionExpiredBanner />)

        expect(screen.queryByText(/session has expired/i)).toBeNull()
    })

    it('calls clearSessionExpired when dismiss button is clicked', () => {
        const clearSessionExpired = vi.fn()
        mockUseSolidPod.mockReturnValue({ ...defaultMock, sessionExpired: true, isLoggedIn: false, clearSessionExpired })

        render(<SessionExpiredBanner />)

        fireEvent.click(screen.getByLabelText('Dismiss'))

        expect(clearSessionExpired).toHaveBeenCalledOnce()
    })

    it('opens the provider selector when "Log in again" is clicked', () => {
        mockUseSolidPod.mockReturnValue({ ...defaultMock, sessionExpired: true, isLoggedIn: false })

        render(<SessionExpiredBanner />)

        expect(screen.queryByTestId('provider-selector')).toBeNull()

        fireEvent.click(screen.getByText('Log in again'))

        expect(screen.getByTestId('provider-selector')).toBeDefined()
    })
})
