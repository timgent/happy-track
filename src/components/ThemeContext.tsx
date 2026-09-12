import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react'

export type Theme = 'light' | 'dark'

/**
 * What the user has asked for. `null` means they have not asked for anything,
 * so the OS decides — and keeps deciding, every time it changes.
 */
export type ThemePreference = Theme | null

export const THEME_STORAGE_KEY = 'theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark'

/**
 * Storage access throws outright — not returns null — when cookies are blocked
 * or the page is sandboxed, so every read and write is guarded. A theme is a
 * nicety; losing it must never take the app down with it.
 */
function readStoredPreference(): ThemePreference {
    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
        return isTheme(stored) ? stored : null
    } catch {
        return null
    }
}

function writeStoredPreference(theme: Theme): void {
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
        // Nothing to do: the choice still applies for this session.
    }
}

function osPrefersDark(): boolean {
    try {
        return window.matchMedia(DARK_QUERY).matches
    } catch {
        return false
    }
}

interface ThemeContextType {
    /** The theme actually being rendered — a choice if there is one, else the OS. */
    theme: Theme
    /** The user's explicit choice, or `null` while the OS is in charge. */
    preference: ThemePreference
    setTheme: (theme: Theme) => void
    toggleTheme: () => void
    /** Hand control back to the OS. */
    useSystemTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [preference, setPreference] = useState<ThemePreference>(readStoredPreference)
    const [systemTheme, setSystemTheme] = useState<Theme>(() => (osPrefersDark() ? 'dark' : 'light'))

    /*
     * The resolved theme is derived, not stored: a stored choice wins over the
     * OS by construction, so an OS change arriving mid-session cannot overwrite
     * it. #281 instead decided once at mount whether to listen to the OS, which
     * left a first-time visitor's listener attached after they picked a theme —
     * and it wrote only to state, so the app and localStorage then disagreed.
     */
    const theme: Theme = preference ?? systemTheme

    useEffect(() => {
        let media: MediaQueryList
        try {
            media = window.matchMedia(DARK_QUERY)
        } catch {
            return
        }

        const onChange = (event: MediaQueryListEvent) => {
            setSystemTheme(event.matches ? 'dark' : 'light')
        }

        // The OS may have changed between the initial state and this effect.
        setSystemTheme(media.matches ? 'dark' : 'light')
        media.addEventListener('change', onChange)
        return () => media.removeEventListener('change', onChange)
    }, [])

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        // Lets the browser paint form controls, scrollbars and the like to match.
        document.documentElement.style.colorScheme = theme
    }, [theme])

    // A choice is written and held together, so the two can never drift apart.
    const setTheme = useCallback((next: Theme) => {
        writeStoredPreference(next)
        setPreference(next)
    }, [])

    const toggleTheme = useCallback(() => {
        setTheme(theme === 'dark' ? 'light' : 'dark')
    }, [setTheme, theme])

    const useSystemTheme = useCallback(() => {
        try {
            window.localStorage.removeItem(THEME_STORAGE_KEY)
        } catch {
            // See writeStoredPreference.
        }
        setPreference(null)
    }, [])

    const value = useMemo(
        () => ({ theme, preference, setTheme, toggleTheme, useSystemTheme }),
        [theme, preference, setTheme, toggleTheme, useSystemTheme]
    )

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/**
 * The current theme read straight off `<html>`, for components that need the
 * colour in JavaScript rather than in a `dark:` class — react-select's inline
 * styles, chiefly. It works without a provider, so a component using it can
 * still be rendered on its own in a test, and follows the class rather than the
 * context so it cannot drift from what the CSS is doing.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useIsDarkMode(): boolean {
    const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

    useEffect(() => {
        const read = () => setIsDark(document.documentElement.classList.contains('dark'))
        read()
        const observer = new MutationObserver(read)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        return () => observer.disconnect()
    }, [])

    return isDark
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
    const context = useContext(ThemeContext)
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}
