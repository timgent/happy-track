import { SignalSlashIcon } from '@heroicons/react/24/outline'
import { useSolidPod } from './SolidPodContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

/**
 * What the app says while it is signed in but cannot reach the Pod.
 *
 * The failure mode this exists for (#342) is not a broken app — everything on
 * screen is the device's own copy and stays editable — it is a user who cannot
 * tell "no signal" from "signed out" and re-authenticates, or worse, assumes
 * their lists are gone. So the banner answers both questions at once: why the
 * Pod is quiet, and what happens to the changes they make in the meantime.
 *
 * Deliberately not dismissible and deliberately not an error: it clears itself
 * the moment the session comes back, which on a passing signal drop is seconds.
 * The alarming banner is `SessionExpiredBanner`, and that one is reserved for a
 * session the provider has actually ended.
 */
export function OfflineBanner() {
    const { isReconnecting } = useSolidPod()
    const isOnline = useOnlineStatus()

    if (!isReconnecting) return null

    return (
        <div
            data-testid="offline-banner"
            role="status"
            aria-live="polite"
            className="bg-primary-50 dark:bg-primary-950/40 border-b border-primary-200 dark:border-primary-800 px-4 py-2.5"
        >
            <p className="text-sm text-primary-900 dark:text-primary-200 font-medium">
                <SignalSlashIcon aria-hidden="true" className="mr-1 inline-block h-4 w-4 align-[-0.2em]" />
                {isOnline
                    ? "Can't reach your Pod — reconnecting."
                    : "You're offline."}
                {' '}
                <span className="font-normal text-primary-800 dark:text-primary-300">
                    Your lists are on this device and stay editable — anything you change will sync once you're back.
                </span>
            </p>
        </div>
    )
}
