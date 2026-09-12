import { Link } from 'react-router-dom'
import { useHappySettings } from '../hooks/useHappySettings'
import { useSolidPod } from '../components/SolidPodContext'
import { ThemeChoice } from '../components/ThemeChoice'
import { SignInHistory } from '../components/SignInHistory'
import { LoadingState } from '../components/LoadingState'
import { friendlyPodName } from '../services/solidPod'

interface ToggleProps {
    label: string
    description: string
    checked: boolean
    onChange: (checked: boolean) => void
}

/**
 * One switch.
 *
 * A real checkbox inside its own label, so the whole row is the hit target and
 * a screen reader gets a checkbox rather than a div with a handler. The visible
 * switch is drawn from the checkbox's own `:checked` state, so there is nothing
 * to keep in step.
 *
 * The knob's movement is written as `peer-checked:[&>span]:translate-x-5`
 * rather than `peer-checked:translate-x-5` on the knob itself, and that is not
 * a stylistic choice: `peer-checked:` compiles to a *sibling* selector
 * (`.peer:checked ~ …`), and the knob is a child of the track, not a sibling of
 * the input. Written the obvious way the knob never moved at all, which left on
 * and off distinguishable only by the track's colour — a state change carried
 * by colour alone, which is exactly what WCAG 1.4.1 is about.
 */
function Toggle({ label, description, checked, onChange }: ToggleProps) {
    return (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60">
            <input
                type="checkbox"
                checked={checked}
                onChange={event => onChange(event.target.checked)}
                className="peer sr-only"
            />
            <span
                aria-hidden="true"
                className="mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full bg-gray-300 p-0.5 transition-colors peer-checked:bg-primary-700 peer-checked:[&>span]:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-2 dark:bg-gray-600 dark:peer-checked:bg-primary-500"
            >
                <span className="h-5 w-5 rounded-full bg-white shadow transition-transform" />
            </span>
            <span className="min-w-0">
                <span className="block font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                <span className="block text-sm text-gray-600 dark:text-gray-400">{description}</span>
            </span>
        </label>
    )
}

export function SettingsPage() {
    const { settings, isLoading, updateSettings } = useHappySettings()
    const { isLoggedIn, isReconnecting, webId } = useSolidPod()

    if (isLoading) {
        return <LoadingState message="Loading your settings…" rows={1} />
    }

    return (
        <div className="mx-auto max-w-2xl">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 sm:text-3xl">Settings</h1>

            <section aria-labelledby="writing-heading" className="mt-6">
                <h2 id="writing-heading" className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Writing
                </h2>
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1.5 shadow-soft">
                    <Toggle
                        label="Suggest a prompt"
                        description="A gentle question above the box on the days when nothing comes to mind."
                        checked={settings.promptsEnabled}
                        onChange={promptsEnabled => { void updateSettings({ promptsEnabled }) }}
                    />
                    <Toggle
                        label="Ask how it felt"
                        description="Shows the five mood faces in the box. Always optional, even when on."
                        checked={settings.moodEnabled}
                        onChange={moodEnabled => { void updateSettings({ moodEnabled }) }}
                    />
                    <Toggle
                        label="Show me “on this day”"
                        description="Resurfaces a happy from this same day in an earlier year."
                        checked={settings.onThisDayEnabled}
                        onChange={onThisDayEnabled => { void updateSettings({ onThisDayEnabled }) }}
                    />
                </div>
                {/* Said once, here, rather than on each row: these three travel
                    with the account, and the theme below deliberately does not. */}
                <p className="mt-2 px-1 text-xs text-gray-500 dark:text-gray-400">
                    {isLoggedIn || isReconnecting
                        ? 'These three are saved to your Pod, so they follow you to your other devices.'
                        : 'Saved on this device. Sign in and they will follow you to your other devices.'}
                </p>
            </section>

            <section aria-labelledby="appearance-heading" className="mt-6">
                <h2 id="appearance-heading" className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Appearance
                </h2>
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-soft">
                    <ThemeChoice />
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        Kept on this device — it is about the screen you are looking at, not about you.
                    </p>
                </div>
            </section>

            <section aria-labelledby="account-heading" className="mt-6">
                <h2 id="account-heading" className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Account
                </h2>
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-soft">
                    {webId ? (
                        <>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                Signed in to <strong className="font-bold">{friendlyPodName(webId)}</strong>
                                {isReconnecting && (
                                    <span className="text-gray-500 dark:text-gray-400"> — out of reach right now, reconnecting.</span>
                                )}
                            </p>
                            <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">{webId}</p>
                        </>
                    ) : (
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            Not signed in. Your happies are on this device only.
                        </p>
                    )}
                    <p className="mt-3 text-sm">
                        <Link to="/your-data" className="font-semibold text-accent-700 dark:text-accent-300 underline hover:no-underline">
                            Export or delete your data
                        </Link>
                    </p>
                </div>
            </section>

            <section aria-labelledby="signin-heading" className="mt-6">
                <h2 id="signin-heading" className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Sign-in history
                </h2>
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-soft">
                    <SignInHistory />
                </div>
            </section>
        </div>
    )
}
