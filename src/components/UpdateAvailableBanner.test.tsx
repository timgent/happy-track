import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { UpdateAvailableBanner } from './UpdateAvailableBanner'

const setNeedRefresh = vi.fn()
const updateServiceWorker = vi.fn()

vi.mock('virtual:pwa-register/react', () => ({
    useRegisterSW: vi.fn(),
}))

import { useRegisterSW } from 'virtual:pwa-register/react'

const mockUseRegisterSW = vi.mocked(useRegisterSW)

function mockSW(needRefresh: boolean) {
    mockUseRegisterSW.mockReturnValue({
        needRefresh: [needRefresh, setNeedRefresh],
        offlineReady: [false, vi.fn()],
        updateServiceWorker,
    })
}

describe('UpdateAvailableBanner', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('says nothing while the installed version is current', () => {
        mockSW(false)

        const { container } = render(<UpdateAvailableBanner />)

        expect(container.innerHTML).toBe('')
    })

    it('offers a reload once a new version has installed in the background', () => {
        mockSW(true)

        render(<UpdateAvailableBanner />)

        expect(screen.getByRole('status').textContent).toMatch(/new version/i)
    })

    it('hands control to the waiting service worker on Reload, rather than reloading silently', () => {
        mockSW(true)

        render(<UpdateAvailableBanner />)
        fireEvent.click(screen.getByRole('button', { name: /reload/i }))

        expect(updateServiceWorker).toHaveBeenCalledWith(true)
    })

    // Dismissing must not lose anything: it only stops asking, it does not
    // reload and does not throw away whatever the person is mid-typing.
    it('lets the prompt be dismissed without reloading', () => {
        mockSW(true)

        render(<UpdateAvailableBanner />)
        fireEvent.click(screen.getByLabelText(/dismiss/i))

        expect(setNeedRefresh).toHaveBeenCalledWith(false)
        expect(updateServiceWorker).not.toHaveBeenCalled()
    })
})
