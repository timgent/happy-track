import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import React from 'react'
import { ThemeProvider, THEME_STORAGE_KEY } from './ThemeContext'
import { ThemeChoice } from './ThemeChoice'

/**
 * The same drivable `matchMedia` ThemeContext.test.tsx uses: the whole point of
 * the System option is that the OS keeps having a say afterwards, and that can
 * only be asserted by changing the OS mid-test.
 */
function installMatchMedia(initialPrefersDark: boolean) {
    let prefersDark = initialPrefersDark
    const listeners = new Set<(e: MediaQueryListEvent) => void>()

    window.matchMedia = vi.fn().mockReturnValue({
        get matches() {
            return prefersDark
        },
        media: '(prefers-color-scheme: dark)',
        addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
            listeners.add(cb)
        },
        removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
            listeners.delete(cb)
        },
    }) as unknown as typeof window.matchMedia

    return {
        setOsTheme(dark: boolean) {
            prefersDark = dark
            act(() => {
                listeners.forEach(cb => cb({ matches: dark } as MediaQueryListEvent))
            })
        },
    }
}

function renderChoice() {
    return render(
        <ThemeProvider>
            <ThemeChoice />
        </ThemeProvider>
    )
}

const option = (name: RegExp | string) => screen.getByRole('radio', { name }) as HTMLInputElement
const storedTheme = () => window.localStorage.getItem(THEME_STORAGE_KEY)
const htmlIsDark = () => document.documentElement.classList.contains('dark')

describe('ThemeChoice', () => {
    beforeEach(() => {
        window.localStorage.clear()
        document.documentElement.classList.remove('dark')
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('offers all three states, not just the two the old toggle flipped between', () => {
        installMatchMedia(false)
        renderChoice()

        expect(option(/^light$/i)).toBeTruthy()
        expect(option(/^dark$/i)).toBeTruthy()
        expect(option(/^system$/i)).toBeTruthy()
    })

    it('starts on System when the user has never chosen', () => {
        installMatchMedia(false)
        renderChoice()

        expect(option(/^system$/i).checked).toBe(true)
        expect(option(/^light$/i).checked).toBe(false)
    })

    it('shows the stored choice rather than System once one has been made', () => {
        installMatchMedia(false)
        window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
        renderChoice()

        expect(option(/^dark$/i).checked).toBe(true)
        expect(option(/^system$/i).checked).toBe(false)
    })

    it('applies and stores an explicit choice', () => {
        installMatchMedia(false)
        renderChoice()

        act(() => {
            option(/^dark$/i).click()
        })

        expect(htmlIsDark()).toBe(true)
        expect(storedTheme()).toBe('dark')
        expect(option(/^dark$/i).checked).toBe(true)
    })

    /*
     * The reason this component exists. `useSystemTheme` was already in
     * ThemeContext and nothing called it, so a user who touched the old toggle
     * once could never hand control back to the OS again (#337).
     */
    it('hands control back to the OS when System is chosen, and keeps it there', () => {
        const media = installMatchMedia(false)
        window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
        renderChoice()

        expect(htmlIsDark()).toBe(true)

        act(() => {
            option(/^system$/i).click()
        })

        expect(storedTheme()).toBeNull()
        expect(htmlIsDark()).toBe(false)

        // Still following, live, after the choice was cleared.
        media.setOsTheme(true)
        expect(htmlIsDark()).toBe(true)
        expect(option(/^system$/i).checked).toBe(true)
    })

    it('still works when localStorage is unavailable', () => {
        installMatchMedia(false)
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked')
        })
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked')
        })

        renderChoice()
        act(() => {
            option(/^dark$/i).click()
        })

        // The choice applies for this session even though it cannot be banked.
        expect(htmlIsDark()).toBe(true)
        getItem.mockRestore()
        setItem.mockRestore()
    })
})
