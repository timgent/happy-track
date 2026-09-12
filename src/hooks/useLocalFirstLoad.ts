import { useEffect, useRef, useState, type DependencyList } from 'react'
import { useDatabase } from '../components/DatabaseContext'

export interface LocalFirstLoad {
    /**
     * True while the pod → local sync started at login could still turn
     * "there's nothing here" into "here it is": the sync is running, or it has
     * just landed and the follow-up read hasn't come back yet.
     *
     * A page that found what it needed locally only uses this to say the pod is
     * still being read (see `PodSyncIndicator`). A page that found nothing keeps
     * its loading treatment up until it clears, rather than showing an empty
     * state that is about to be wrong.
     */
    isCheckingPod: boolean
}

/**
 * Reads local data straight away and lets the pod catch up afterwards.
 *
 * Everything this app shows is stored on the device as well as in the pod, so
 * there is nearly always something to render immediately: the PouchDB read
 * resolves in milliseconds. The pod → local sync that runs at login walks the
 * whole pod — the settings, every month of happies — and takes
 * as long as the pod takes to answer, which on a slow connection is seconds.
 * Blocking the first paint on it turns opening a list the device already holds
 * into a wait for data the page isn't going to use.
 *
 * So `read` runs on mount, and again when the login sync finishes in case it
 * brought something this device had never seen. A page whose data is already on
 * screen by then, and that reconciles pod changes some other way — a
 * per-resource `usePodSync` poll, say — should skip that second read itself
 * rather than overwrite what the user is looking at.
 *
 * `read` is always called through its latest closure, so it does not need to be
 * memoized and does not belong in `deps`. Put in `deps` only what changes *which
 * data to read* — the database, a list id — the way you would for `useEffect`.
 */
export function useLocalFirstLoad(read: () => void | Promise<void>, deps: DependencyList): LocalFirstLoad {
    const { loginSyncVersion, loginSyncInProgress } = useDatabase()

    const readRef = useRef(read)
    readRef.current = read

    // Which login sync the last completed read saw. Seeded with the version at
    // mount so a page that opens after the sync — or with no pod at all — never
    // claims to be checking one. It falls behind only when a sync lands, and
    // catches up when the read it triggered comes back. Comparing the two during
    // render is what stops an empty state painting for a frame between the sync
    // finishing and its read returning.
    const [readSyncVersion, setReadSyncVersion] = useState(loginSyncVersion)

    useEffect(() => {
        let cancelled = false
        Promise.resolve(readRef.current())
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setReadSyncVersion(loginSyncVersion)
            })
        return () => { cancelled = true }
    // The caller's deps are spread in deliberately; `read` is reached through a
    // ref so a fresh closure on every render can't turn this into a read loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, loginSyncVersion])

    return { isCheckingPod: loginSyncInProgress || readSyncVersion !== loginSyncVersion }
}
