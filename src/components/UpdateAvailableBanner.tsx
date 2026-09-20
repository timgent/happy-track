import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Tells a user with the app already open that a new version has been built
 * and installed in the background, and lets them choose when to take it.
 *
 * Deliberately not automatic: the update strategy is `registerType: 'prompt'`
 * (vite.config.ts) rather than `autoUpdate`, because an unprompted reload
 * would land mid-keystroke on whoever is typing in `HappyComposer` — the
 * composer only saves on submit, so a silent reload is a silent loss of
 * whatever they had not yet sent. Dismissing here does not lose anything
 * either: the app keeps running the version it already loaded until the
 * next real reload picks up the new one.
 */
export function UpdateAvailableBanner() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(_url, registration) {
            if (!registration) return
            // The service worker spec has no push channel for "a new version
            // exists" — the browser only checks on navigation. A tab left
            // open across a deploy would otherwise never learn about it.
            setInterval(() => { registration.update() }, 60 * 60 * 1000)
        },
    })

    if (!needRefresh) return null

    return (
        <div
            data-testid="update-available-banner"
            role="status"
            aria-live="polite"
            className="bg-accent-50 dark:bg-accent-950/40 border-b border-accent-200 dark:border-accent-800 px-4 py-2.5 flex items-center justify-between gap-3"
        >
            <p className="text-sm text-accent-900 dark:text-accent-200 font-medium">
                A new version of Happy Track is ready.
            </p>
            <div className="flex items-center gap-3 shrink-0">
                <button
                    onClick={() => updateServiceWorker(true)}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-accent-900 dark:text-accent-200 underline hover:no-underline"
                >
                    <ArrowPathIcon aria-hidden="true" className="h-4 w-4" />
                    Reload
                </button>
                <button onClick={() => setNeedRefresh(false)} aria-label="Dismiss">
                    <XMarkIcon className="h-4 w-4 text-accent-700 dark:text-accent-300 hover:text-accent-900 dark:hover:text-accent-200" />
                </button>
            </div>
        </div>
    )
}
