import { createContext, ReactNode, useContext, useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { HappyTrackDatabase, LOCAL_NAMESPACE } from '../services/database'
import { useSolidPod } from './SolidPodContext'
import { getPrimaryPodUrl, hasPodData, syncAllDataFromPod } from '../services/solidPod'
import { rememberPodNamespace, rememberedPodNamespace } from '../services/rememberedSession'
import { mergeHappyMonths } from '../happies/mergeMonths'
import { onAppResumed } from '../services/appResume'
import { ConfirmationDialog } from './ConfirmationDialog'

interface DatabaseContextValue {
    db: HappyTrackDatabase
    /** Increments each time the background sign-in sync completes, so components can re-read. */
    loginSyncVersion: number
    /** True while the background sign-in sync is running; pages can say so. */
    loginSyncInProgress: boolean
}

const DatabaseContext = createContext<DatabaseContextValue | undefined>(undefined)

/**
 * Provides a PouchDB instance namespaced to the current pod identity.
 *
 * - Signed out → the `local` namespace (`happy-track-data--local`)
 * - Signed in → the pod URL (`happy-track-data--sam.solidcommunity.net`)
 *
 * One database per identity, always. Without that, signing in to a second
 * account on a shared laptop would show — and then upload — the first
 * account's happies.
 *
 * Children are not rendered until the database is ready, and are remounted
 * wholesale when the namespace changes, so no page can be left holding rows it
 * read from the previous identity's database.
 */
export function DatabaseProvider({ children }: { children: ReactNode }) {
    const { isLoggedIn, isReconnecting, webId, session, isLoading } = useSolidPod()
    const [db, setDb] = useState<HappyTrackDatabase | null>(null)
    const [namespace, setNamespace] = useState<string | null>(null)
    const [isResolvingPod, setIsResolvingPod] = useState(false)
    const [showMigrationPrompt, setShowMigrationPrompt] = useState(false)
    const [localDb, setLocalDb] = useState<HappyTrackDatabase | null>(null)
    const [loginSyncVersion, setLoginSyncVersion] = useState(0)
    const [loginSyncInProgress, setLoginSyncInProgress] = useState(false)

    // `resync` reads the database through a ref rather than closing over it, so
    // its identity does not change every time the database does — the effect
    // below attaches listeners and must not re-attach on every render.
    const dbRef = useRef<HappyTrackDatabase | null>(null)
    dbRef.current = db

    // The namespace already synced, so a session-object refresh (which changes
    // the `session` reference without changing the identity) does not trigger a
    // second full sync.
    const syncedNamespaceRef = useRef<string | null>(null)
    // Guards against two full syncs running at once — coming back online and
    // the app returning to the foreground often happen together.
    const syncInFlightRef = useRef(false)

    /**
     * Reconciles the whole pod with this device, in both directions.
     *
     * Called on sign-in, and again whenever the connection comes back or the
     * app returns to the foreground. That second case is not an optimisation:
     * a happy written while offline is saved locally and its pod push fails,
     * and nothing else would ever retry it. The per-resource poll only *reads*,
     * and the sign-in sync runs once per identity — so without this, an entry
     * written on a train stayed on that one device until the app happened to be
     * reloaded. It is the other half of "anything you change will sync once
     * you're back", which the offline banner promises in so many words.
     *
     * Safe to call at any time: the sync merges rather than overwrites, and
     * pushes only what differs.
     */
    const resync = useCallback(async (trigger: string) => {
        if (syncInFlightRef.current) return
        if (!session || !isLoggedIn) return
        const podDb = dbRef.current
        if (!podDb) return

        syncInFlightRef.current = true
        setLoginSyncInProgress(true)
        try {
            const podUrl = await getPrimaryPodUrl(session)
            if (!podUrl) return
            const result = await syncAllDataFromPod(session, podUrl, podDb)
            // Only disturb the pages when something actually moved.
            if (result.monthsDownloaded > 0 || result.settingsSynced) {
                setLoginSyncVersion(version => version + 1)
            }
        } catch (err) {
            console.error(`Re-sync (${trigger}) failed:`, err)
        } finally {
            syncInFlightRef.current = false
            setLoginSyncInProgress(false)
        }
    }, [session, isLoggedIn])

    useEffect(() => {
        if (isLoading) return

        if (!isLoggedIn || !webId) {
            // Signed in but unable to reach the pod. The namespace is normally
            // derived from the pod URL, which is read from the WebID profile —
            // impossible with no network — so without a remembered one the app
            // would open the empty `local` database and the user's happies
            // would appear to be gone. This is a read of the device's own copy;
            // nothing is asked of the pod until a session is live again.
            if (isReconnecting && webId) {
                const offlineNamespace =
                    rememberedPodNamespace(webId) ?? HappyTrackDatabase.sanitizePodUrl(webId)
                setShowMigrationPrompt(false)
                setNamespace(offlineNamespace)
                setDb(HappyTrackDatabase.getInstance(offlineNamespace))
                return
            }

            syncedNamespaceRef.current = null
            setShowMigrationPrompt(false)
            setNamespace(LOCAL_NAMESPACE)
            setDb(HappyTrackDatabase.getInstance(LOCAL_NAMESPACE))
            return
        }

        // Signed in — resolve the pod URL to use as the namespace. Skip the
        // resolution when it has already been done for this identity.
        const alreadySynced = syncedNamespaceRef.current !== null
        let cancelled = false
        if (!alreadySynced) setIsResolvingPod(true)

        void getPrimaryPodUrl(session).then(async podUrl => {
            if (cancelled) return

            const resolvedNamespace = podUrl
                ? HappyTrackDatabase.sanitizePodUrl(podUrl)
                : HappyTrackDatabase.sanitizePodUrl(webId)

            // Banked for the next start that has no network: working this out
            // again needs the pod, and that is exactly what will be missing.
            rememberPodNamespace(webId, resolvedNamespace)

            if (syncedNamespaceRef.current === resolvedNamespace) {
                if (!alreadySynced) setIsResolvingPod(false)
                return
            }

            const podDb = HappyTrackDatabase.getInstance(resolvedNamespace)
            const local = HappyTrackDatabase.getInstance(LOCAL_NAMESPACE)

            const dismissedKey = `pod-migration-dismissed-${resolvedNamespace}`
            const dismissed = localStorage.getItem(dismissedKey) === 'true'

            let podHasData: boolean | null = null

            if (!dismissed && podUrl && session) {
                const [hasRemote, localEmpty] = await Promise.all([
                    hasPodData(session, podUrl),
                    local.isEmpty(),
                ])
                podHasData = hasRemote
                // Happies written before signing in. They are the user's, and
                // nothing else is going to move them across — so ask, once.
                if (!hasRemote && !localEmpty) {
                    if (cancelled) return
                    setLocalDb(local)
                    setNamespace(resolvedNamespace)
                    setDb(podDb)
                    setShowMigrationPrompt(true)
                    setIsResolvingPod(false)
                    return
                }
            }

            if (cancelled) return
            setNamespace(resolvedNamespace)
            setDb(podDb)
            setIsResolvingPod(false)

            // Background sync, once per identity rather than per session
            // refresh. Fire-and-forget: a failure must not block the app, and
            // everything on screen is the device's own copy anyway.
            if (podUrl && session) {
                syncedNamespaceRef.current = resolvedNamespace
                syncInFlightRef.current = true
                setLoginSyncInProgress(true)
                void (async () => {
                    try {
                        await syncAllDataFromPod(session, podUrl, podDb)
                        setLoginSyncVersion(v => v + 1)
                    } catch (err) {
                        console.error('Background sign-in sync failed:', err)
                    } finally {
                        syncInFlightRef.current = false
                        setLoginSyncInProgress(false)
                    }
                })()
            } else if (podHasData === false) {
                // Nothing to sync from, and nothing in flight — make sure
                // pages that wait on the sync are not left waiting.
                setLoginSyncInProgress(false)
            }
        })

        return () => { cancelled = true }
    }, [isLoggedIn, isReconnecting, webId, session, isLoading])

    /*
     * Take every chance to reconcile: the connection coming back, and the app
     * returning to the foreground. Both are moments when this device may be
     * holding a write the pod has never seen — and on a phone, the second is
     * the only signal that arrives at all, because the timers were frozen along
     * with the process.
     *
     * Both paths are idempotent and guarded, so hearing about one event twice
     * costs nothing.
     */
    useEffect(() => {
        if (!isLoggedIn) return

        const onOnline = () => { void resync('online') }
        const stopWatchingResume = onAppResumed(() => { void resync('resumed') })
        window.addEventListener('online', onOnline)

        return () => {
            window.removeEventListener('online', onOnline)
            stopWatchingResume()
        }
    }, [isLoggedIn, resync])

    if (isLoading || isResolvingPod || !db || !namespace) {
        return null
    }

    if (showMigrationPrompt && localDb) {
        return (
            <ConfirmationDialog
                isOpen
                title="You have happies saved on this device"
                message={'You wrote some happies before signing in.\nWould you like to move them into your Pod, so they are on all your devices?'}
                confirmText="Move them to my Pod"
                cancelText="Start fresh"
                onConfirm={async () => {
                    await db.copyAllDataFrom(localDb, mergeHappyMonths)
                    // Marked dismissed so a reload does not ask again: the
                    // happies are copied, and the pod will not report them
                    // until the next sync pushes them up.
                    localStorage.setItem(`pod-migration-dismissed-${namespace}`, 'true')
                    setShowMigrationPrompt(false)
                }}
                onClose={() => {
                    localStorage.setItem(`pod-migration-dismissed-${namespace}`, 'true')
                    setShowMigrationPrompt(false)
                }}
            />
        )
    }

    // The Fragment key remounts every child when the active namespace changes
    // (sign in, sign out), so no page can keep showing rows it read from the
    // previous identity's database.
    return (
        <DatabaseContext.Provider value={{ db, loginSyncVersion, loginSyncInProgress }}>
            <Fragment key={namespace}>
                {children}
            </Fragment>
        </DatabaseContext.Provider>
    )
}

/** The PouchDB instance for the current identity. */
// eslint-disable-next-line react-refresh/only-export-components
export function useDatabase(): DatabaseContextValue {
    const context = useContext(DatabaseContext)
    if (context === undefined) {
        throw new Error('useDatabase must be used within a DatabaseProvider')
    }
    return context
}
