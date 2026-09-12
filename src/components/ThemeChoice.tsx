import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { useTheme, type Theme } from './ThemeContext'

/**
 * "System" is not a fourth stored value — it is the absence of a stored one.
 * `ThemePreference` is already `Theme | null`, and the pre-paint script in
 * index.html reads the same key with the same "absent means the OS decides"
 * convention, so keeping it that way means neither has to learn a new word.
 */
type ThemeSetting = Theme | 'system'

const OPTIONS: { value: ThemeSetting; label: string; Icon: typeof SunIcon }[] = [
    { value: 'light', label: 'Light', Icon: SunIcon },
    { value: 'dark', label: 'Dark', Icon: MoonIcon },
    { value: 'system', label: 'System', Icon: ComputerDesktopIcon },
]

/**
 * Light / Dark / System, as three radios styled into a segmented control.
 *
 * It replaces `ThemeToggle`, which was a one-way door: it flipped light ⇄ dark
 * and had no way back to following the OS, so a single tap permanently opted
 * you out of your device's setting (#337). `ThemeContext` has shipped
 * `useSystemTheme` for exactly this since the #281 follow-up, with nothing
 * calling it; this is the caller.
 *
 * Real radios rather than buttons: a fieldset of radios is what "pick one of
 * three" already means to a screen reader and to the arrow keys, and it needs no
 * roving-focus code of its own to keep that promise.
 */
export function ThemeChoice() {
    /*
     * Aliased on the way out of the context: `useSystemTheme` is a callback, not
     * a hook, and calling it from an event handler under its own name trips
     * react-hooks/rules-of-hooks. Renaming it here rather than in ThemeContext
     * keeps the context's published name — and its tests — untouched.
     */
    const { preference, setTheme, useSystemTheme: followSystem } = useTheme()
    const current: ThemeSetting = preference ?? 'system'

    const choose = (value: ThemeSetting) => {
        if (value === 'system') followSystem()
        else setTheme(value)
    }

    return (
        <fieldset>
            <legend className="sr-only">Theme</legend>
            {/*
              * A three-column grid rather than a wrapping flex row: at 390px the
              * flex version dropped "System" onto a second line on its own, which
              * reads as a different kind of option than the other two.
              */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800 sm:inline-grid sm:w-auto">
                {OPTIONS.map(({ value, label, Icon }) => {
                    const isSelected = current === value
                    return (
                        <label
                            key={value}
                            /*
                             * The radio itself is sr-only, so the focus ring has to
                             * be drawn by the label around it or keyboard users get
                             * no indicator at all. Same `has-[:focus-visible]:`
                             * treatment the item chips use in CategoryItemGrid.
                             */
                            className={`flex items-center justify-center gap-1.5 min-h-[44px] px-2 sm:px-4 rounded-lg text-sm font-semibold cursor-pointer transition-colors duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-600 dark:has-[:focus-visible]:ring-primary-400 ${
                                isSelected
                                    ? 'bg-white dark:bg-gray-900 text-primary-800 dark:text-primary-200 shadow-soft'
                                    : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-900/60'
                            }`}
                        >
                            <input
                                type="radio"
                                name="theme"
                                value={value}
                                checked={isSelected}
                                onChange={() => choose(value)}
                                className="sr-only"
                            />
                            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                            {label}
                        </label>
                    )
                })}
            </div>
        </fieldset>
    )
}
