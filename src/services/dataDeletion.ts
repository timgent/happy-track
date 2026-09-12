import PouchDB from 'pouchdb'
import { getSolidDataset, getContainedResourceUrlAll, deleteFile, deleteContainer } from '@inrupt/solid-client'
import { AppSession as Session } from '../types/AppSession'
import {
    HappyTrackDatabase,
    DATABASE_NAME_PREFIX,
    LOCAL_NAMESPACE,
    databaseNameForNamespace,
} from './database'
import { POD_CONTAINERS, isAuthenticationError, handlePodError, resetPodSessionCaches } from './solidPod'

/**
 * Deleting everything the app has stored — the Google Play "data deletion"
 * route, and the honest answer to "how do I get my data back off this thing?".
 *
 * Kept separate from `database.ts` and `solidPod.ts` because it is the one
 * operation that has to know about *both* stores, and about the leftovers
 * neither of them owns (legacy databases, localStorage).
 */

/** PouchDB's IndexedDB adapter stores database `foo` as IndexedDB database `_pouch_foo`. */
const POUCHDB_IDB_PREFIX = '_pouch_'

/** Written by `solidPod.ts` as `pod-url:<webId>` -> pod URL, one per pod logged into. */
const POD_URL_CACHE_PREFIX = 'pod-url:'

function getStatusCode(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null) return undefined
    const code = (err as { statusCode?: unknown }).statusCode
    return typeof code === 'number' ? code : undefined
}

function isAppDatabaseName(name: string): boolean {
    return name.startsWith(DATABASE_NAME_PREFIX)
}

/**
 * Namespaces for pods this device has logged into, recovered from the pod-URL
 * cache. This is the fallback for browsers without `indexedDB.databases()`
 * (Firefox, older Safari), where the app cannot ask what it has created and has
 * to reconstruct the list from what it remembers.
 */
function namespacesFromCachedPodUrls(): string[] {
    const namespaces: string[] = []
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (!key?.startsWith(POD_URL_CACHE_PREFIX)) continue
            const podUrl = localStorage.getItem(key)
            if (podUrl) namespaces.push(HappyTrackDatabase.sanitizePodUrl(podUrl))
        }
    } catch {
        // localStorage unavailable — the known names below still get cleaned up.
    }
    return namespaces
}

/**
 * Every local database this app may have created on this device: the anonymous
 * one, and one per pod signed into.
 */
export async function localDatabaseNames(): Promise<string[]> {
    const names = new Set<string>([
        databaseNameForNamespace(LOCAL_NAMESPACE),
        ...namespacesFromCachedPodUrls().map(databaseNameForNamespace),
    ])

    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
        try {
            for (const { name } of await indexedDB.databases()) {
                if (!name) continue
                const bare = name.startsWith(POUCHDB_IDB_PREFIX) ? name.slice(POUCHDB_IDB_PREFIX.length) : name
                if (isAppDatabaseName(bare)) names.add(bare)
            }
        } catch {
            // Enumeration unsupported or blocked — the reconstructed names stand.
        }
    }

    return [...names]
}

/**
 * Deletes everything this app has put on this device.
 *
 * Storage is cleared wholesale rather than key by key. An allowlist of keys to
 * remove would have to be updated every time a feature stores something, and
 * forgetting would leave user data behind with nothing to catch it — the same
 * trap `toDocumentData` avoids in `database.ts`. The app owns its origin
 * outright, so there is nothing else on it to preserve.
 *
 * Note this does not touch the pod: for a logged-in user the pod copy syncs
 * straight back down on next login, so callers offering a full deletion must
 * delete the pod data too.
 */
export async function deleteAllLocalData(): Promise<void> {
    // Read before clearing — the pod-URL cache is how the databases are found.
    const names = await localDatabaseNames()

    for (const name of names) {
        await new PouchDB(name).destroy()
    }

    // Cached handles point at databases that no longer exist.
    HappyTrackDatabase.forgetAllInstances()

    try {
        localStorage.clear()
        sessionStorage.clear()
    } catch {
        // Storage unavailable (private mode, blocked cookies) — nothing stored, nothing to clear.
    }
}

/**
 * Deletes the app's container from the user's pod, and everything under it.
 *
 * Walks the tree rather than deleting a fixed list of resources: Solid will not
 * delete a non-empty container, and a hardcoded list would silently start
 * leaving files behind the next time a new resource type is added.
 *
 * A container that is already gone counts as success — the end state the caller
 * asked for is the one that matters.
 */
export async function deleteAllPodData(session: Session, podUrl: string): Promise<void> {
    await deleteContainerRecursively(session, `${podUrl}${POD_CONTAINERS.ROOT}`)
    // The containers we just removed are still in the "known to exist" set —
    // forget them, so the next write recreates them instead of assuming.
    resetPodSessionCaches()
}

async function deleteContainerRecursively(session: Session, containerUrl: string): Promise<void> {
    let dataset
    try {
        dataset = await getSolidDataset(containerUrl, { fetch: session.fetch })
    } catch (err: unknown) {
        if (isAuthenticationError(err)) handlePodError(err)
        if (getStatusCode(err) === 404) return
        throw err
    }

    for (const url of getContainedResourceUrlAll(dataset)) {
        if (url.endsWith('/')) {
            await deleteContainerRecursively(session, url)
        } else {
            await deleteResource(session, url)
        }
    }

    await deleteContainer(containerUrl, { fetch: session.fetch })
}

async function deleteResource(session: Session, url: string): Promise<void> {
    try {
        await deleteFile(url, { fetch: session.fetch })
    } catch (err: unknown) {
        if (isAuthenticationError(err)) handlePodError(err)
        if (getStatusCode(err) === 404) return
        throw err
    }
}
