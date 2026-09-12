import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { ThemeProvider, useIsDarkMode, useTheme, THEME_STORAGE_KEY } from './ThemeContext'

/**
 * A fake `matchMedia` we can drive: the OS theme can be set up front and
 * changed mid-test, which is the case the previous attempt at dark mode
 * (#281) got wrong.
 */
function installMatchMedia(initialPrefersDark: boolean) {
    let prefersDark = initialPrefersDark
    const listeners = new Set<(e: MediaQueryListEvent) => void>()

    const mql = {
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
    }

    window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia

    return {
        setOsTheme(dark: boolean) {
            prefersDark = dark
            act(() => {
                listeners.forEach(cb => cb({ matches: dark } as MediaQueryListEvent))
            })
        },
        get listenerCount() {
            return listeners.size
        },
    }
}

function ThemeProbe() {
    const { theme, preference, setTheme, toggleTheme } = useTheme()
    return (
        <div>
            <span data-testid="theme">{theme}</span>
            <span data-testid="preference">{preference ?? 'system'}</span>
            <button onClick={() => setTheme('dark')}>choose dark</button>
            <button onClick={() => setTheme('light')}>choose light</button>
            <button onClick={toggleTheme}>toggle</button>
        </div>
    )
}

function renderProbe() {
    return render(
        <ThemeProvider>
            <ThemeProbe />
        </ThemeProvider>
    )
}

const storedTheme = () => window.localStorage.getItem(THEME_STORAGE_KEY)
const resolvedTheme = () => screen.getByTestId('theme').textContent
const chosenPreference = () => screen.getByTestId('preference').textContent
const htmlIsDark = () => document.documentElement.classList.contains('dark')

describe('ThemeContext', () => {
    beforeEach(() => {
        window.localStorage.clear()
        document.documentElement.classList.remove('dark')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('follows the OS preference when nothing is stored', () => {
        installMatchMedia(true)
        renderProbe()

        expect(resolvedTheme()).toBe('dark')
        expect(chosenPreference()).toBe('system')
        expect(htmlIsDark()).toBe(true)
    })

    it('keeps following the OS while the user has made no choice', () => {
        const media = installMatchMedia(false)
        renderProbe()

        expect(resolvedTheme()).toBe('light')

        media.setOsTheme(true)

        expect(resolvedTheme()).toBe('dark')
        expect(htmlIsDark()).toBe(true)
        // Following the OS is not a choice, so nothing is written.
        expect(storedTheme()).toBeNull()
    })

    it('prefers a stored choice over the OS preference', () => {
        installMatchMedia(true)
        window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
        renderProbe()

        expect(resolvedTheme()).toBe('light')
        expect(chosenPreference()).toBe('light')
        expect(htmlIsDark()).toBe(false)
    })

    it('stops following the OS once the user chooses, including when the OS changes mid-session', () => {
        // The #281 bug: a first-time visitor's media listener was attached with
        // `[]` deps, so it kept overriding the choice made after mount.
        const media = installMatchMedia(false)
        renderProbe()

        act(() => {
            screen.getByText('choose dark').click()
        })

        expect(resolvedTheme()).toBe('dark')
        expect(storedTheme()).toBe('dark')

        media.setOsTheme(true)
        expect(resolvedTheme()).toBe('dark')

        // The OS going back to light must not undo the choice either.
        media.setOsTheme(false)
        expect(resolvedTheme()).toBe('dark')
        expect(htmlIsDark()).toBe(true)
        expect(storedTheme()).toBe('dark')
    })

    it('never lets the rendered theme and localStorage disagree', () => {
        const media = installMatchMedia(true)
        renderProbe()

        act(() => {
            screen.getByText('choose light').click()
        })
        expect(resolvedTheme()).toBe('light')
        expect(storedTheme()).toBe('light')

        media.setOsTheme(false)
        media.setOsTheme(true)
        expect(resolvedTheme()).toBe('light')
        expect(storedTheme()).toBe('light')

        act(() => {
            screen.getByText('toggle').click()
        })
        expect(resolvedTheme()).toBe('dark')
        expect(storedTheme()).toBe('dark')
    })

    it('toggles from the currently resolved theme', () => {
        installMatchMedia(true)
        renderProbe()

        act(() => {
            screen.getByText('toggle').click()
        })

        expect(resolvedTheme()).toBe('light')
        expect(storedTheme()).toBe('light')
    })

    it('ignores an unrecognised stored value and falls back to the OS', () => {
        installMatchMedia(true)
        window.localStorage.setItem(THEME_STORAGE_KEY, 'aubergine')
        renderProbe()

        expect(resolvedTheme()).toBe('dark')
        expect(chosenPreference()).toBe('system')
    })

    it('still works when localStorage is unavailable', () => {
        installMatchMedia(true)
        const denied = () => {
            throw new Error('The operation is insecure.')
        }
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied)
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied)

        expect(() => renderProbe()).not.toThrow()
        expect(resolvedTheme()).toBe('dark')

        expect(() =>
            act(() => {
                screen.getByText('choose light').click()
            })
        ).not.toThrow()
        expect(resolvedTheme()).toBe('light')
        expect(htmlIsDark()).toBe(false)
    })

    it('removes its media listener when unmounted', () => {
        const media = installMatchMedia(false)
        const { unmount } = renderProbe()

        expect(media.listenerCount).toBeGreaterThan(0)
        unmount()
        expect(media.listenerCount).toBe(0)
    })
})

describe('useIsDarkMode', () => {
    function DarkProbe() {
        return <span data-testid="is-dark">{String(useIsDarkMode())}</span>
    }

    beforeEach(() => {
        document.documentElement.classList.remove('dark')
    })

    it('reads the theme off <html> without needing a provider', () => {
        document.documentElement.classList.add('dark')

        render(<DarkProbe />)

        expect(screen.getByTestId('is-dark').textContent).toBe('true')
    })

    it('follows the class when the theme changes', async () => {
        render(<DarkProbe />)
        expect(screen.getByTestId('is-dark').textContent).toBe('false')

        // The hook watches <html> for the class ThemeProvider toggles.
        document.documentElement.classList.add('dark')

        await waitFor(() => expect(screen.getByTestId('is-dark').textContent).toBe('true'))
    })
})

/**
 * The theme has to be on `<html>` before the first paint or the page flashes
 * the wrong colours, which means a small inline script rather than React. It
 * runs on every page load in every browser, so it must never throw — a
 * cookie-blocked or sandboxed context makes `localStorage` itself throw.
 */
describe('pre-paint theme script in index.html', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8')
    const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''

    beforeEach(() => {
        window.localStorage.clear()
        document.documentElement.classList.remove('dark')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    const runScript = () => new Function(inlineScript)()

    it('is present in index.html', () => {
        expect(inlineScript).toContain('classList')
    })

    it('applies the stored theme', () => {
        installMatchMedia(false)
        window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')

        runScript()

        expect(htmlIsDark()).toBe(true)
    })

    it('falls back to the OS preference', () => {
        installMatchMedia(true)

        runScript()

        expect(htmlIsDark()).toBe(true)
    })

    it('does not throw when localStorage is unavailable', () => {
        installMatchMedia(true)
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('The operation is insecure.')
        })

        expect(() => runScript()).not.toThrow()
        // Still gets the OS preference right despite the failure.
        expect(htmlIsDark()).toBe(true)
    })
})
