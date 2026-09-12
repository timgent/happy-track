import { useState } from 'react'
import { DevicePhoneMobileIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useSolidPod } from './SolidPodContext'
import { SolidProviderSelector } from './SolidProviderSelector'

/**
 * Dismissal lives in sessionStorage on purpose: a "not now" should hold for the
 * rest of the visit without silencing the prompt forever.
 */
export const SYNC_PROMPT_DISMISSED_KEY = 'sync-prompt-dismissed'

function wasDismissed(): boolean {
    try {
        return sessionStorage.getItem(SYNC_PROMPT_DISMISSED_KEY) === 'true'
    } catch {
        return false
    }
}

/**
 * A subtle, dismissible nudge shown to logged-out users who already have
 * something worth keeping. Renders nothing once the user is logged in (or
 * signed in but offline) or has dismissed it this session.
 */
export function SyncAcrossDevicesPrompt() {
    const { isLoggedIn, isReconnecting, login } = useSolidPod()
    const [isDismissed, setIsDismissed] = useState(wasDismissed)
    const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)

    // `isReconnecting` is a signed-in user the app cannot reach the pod for
    // (#342). Asking them to sign in would be telling them their session is
    // gone when it is not — and signing in again is not the fix for no signal.
    if (isLoggedIn || isReconnecting || isDismissed) return null

    const handleDismiss = () => {
        try {
            sessionStorage.setItem(SYNC_PROMPT_DISMISSED_KEY, 'true')
        } catch {
            // Storage unavailable — the prompt just comes back on the next visit
        }
        setIsDismissed(true)
    }

    return (
        <>
            <div
                data-testid="sync-across-devices-prompt"
                className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/70 dark:bg-primary-950/40 px-4 py-3"
            >
                <p className="flex-1 min-w-50 text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-bold text-primary-900 dark:text-primary-200">
                        <DevicePhoneMobileIcon aria-hidden="true" className="mr-1 inline-block h-4 w-4 align-[-0.2em]" />
                        Sync across devices
                    </span>
                    {' — '}
                    sign in to pick your happies up on your phone or laptop, and keep them safe if you clear your browser.
                </p>
                <div className="flex items-center gap-1 ml-auto">
                    <button
                        type="button"
                        onClick={() => setIsProviderSelectorOpen(true)}
                        className="text-sm font-bold text-primary-700 dark:text-primary-300 underline hover:no-underline px-2 py-1"
                    >
                        Sign in
                    </button>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        aria-label="Dismiss sync prompt"
                        className="p-2 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
                    >
                        <XMarkIcon className="h-4 w-4 text-primary-700 dark:text-primary-300" />
                    </button>
                </div>
            </div>

            <SolidProviderSelector
                isOpen={isProviderSelectorOpen}
                onClose={() => setIsProviderSelectorOpen(false)}
                onSelect={issuer => login(issuer)}
            />
        </>
    )
}
