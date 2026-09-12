/**
 * What the device remembers about the signed-in user *between* live sessions.
 *
 * A Solid session only becomes live once the provider has answered a refresh —
 * which needs the network. With no network there is nothing to answer with, so
 * everything the app knows about who is signed in would be gone until the
 * connection came back: the nav would offer "Sync & Share", and the pod-scoped
 * PouchDB namespace (which is derived from the pod URL, fetched from the WebID
 * profile) could not be worked out at all, so the user's own lists would not
 * even be on screen. That is #342 — offline looked exactly like signed out.
 *
 * So two facts are kept here, in localStorage, from the last live session:
 * the WebID, and the PouchDB namespace that identity's data lives in. Neither
 * is a credential — the refresh token stays in IndexedDB, owned by the auth
 * library — and both are cleared the moment the session genuinely ends, so a
 * signed-out device remembers nothing.
 */

const WEB_ID_KEY = 'ht-last-signed-in-webid'
const NAMESPACE_KEY_PREFIX = 'ht-pod-namespace-'

function read(key: string): string | undefined {
    try {
        return localStorage.getItem(key) ?? undefined
    } catch {
        // Storage unavailable (private mode, blocked cookies) — the app just
        // falls back to its logged-out face, which is what it did before.
        return undefined
    }
}

function write(key: string, value: string): void {
    try {
        localStorage.setItem(key, value)
    } catch {
        // Nothing to do: remembering is an optimisation, not a requirement.
    }
}

/** The WebID of the last session that was live on this device. */
export function rememberedWebId(): string | undefined {
    return read(WEB_ID_KEY)
}

export function rememberSignedIn(webId: string): void {
    write(WEB_ID_KEY, webId)
}

/**
 * Forgets the signed-in identity. Called only when the session is actually over
 * — a deliberate logout, or the provider rejecting the grant — never for a
 * failure the app expects to recover from.
 */
export function forgetSignedIn(): void {
    try {
        localStorage.removeItem(WEB_ID_KEY)
    } catch {
        // Nothing to do.
    }
}

/**
 * The PouchDB namespace an identity's data lives in.
 *
 * Normally derived from the pod URL, which comes from the WebID profile — a
 * network read. Remembering it is what lets an offline start open the user's
 * own database rather than the empty `local` one.
 */
export function rememberedPodNamespace(webId: string): string | undefined {
    return read(NAMESPACE_KEY_PREFIX + webId)
}

export function rememberPodNamespace(webId: string, namespace: string): void {
    write(NAMESPACE_KEY_PREFIX + webId, namespace)
}
