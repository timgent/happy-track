import {
    createContainerAt,
    deleteFile,
    getContainedResourceUrlAll,
    getPodUrlAll,
    getSolidDataset,
    getStringNoLocale,
    getThing,
    getUrl,
    overwriteFile,
    solidDatasetAsTurtle,
} from '@inrupt/solid-client'
import type { SolidDataset } from '@inrupt/solid-client'
import { AppSession as Session } from '../types/AppSession'
import type { HappyTrackDatabase } from './database'
import type { HappyMonth, HappySettings } from '../happies/types'
import { mergeHappyMonths, monthsEqual } from '../happies/mergeMonths'
import {
    datasetToHappyMonth,
    datasetToSettings,
    happyMonthToDataset,
    settingsToDataset,
} from './rdfSerialization'
import { isMonthKey } from '../happies/dates'
import { profile } from '../utils/profiling'
import { yieldToEventLoop } from '../utils/yieldToEventLoop'
import { responseToDataset } from './rdfDataset'

/** Where Happy Track keeps things under the user's pod root. */
export const POD_CONTAINERS = {
    ROOT: 'happy-track/',
    MONTHS: 'happy-track/months/',
    SETTINGS: 'happy-track/settings.ttl',
    BACKUPS: 'happy-track/backups/',
} as const

export const POD_ERROR_MESSAGES = {
    NOT_LOGGED_IN: 'You need to be signed in to save to your Pod',
    NO_POD_FOUND: 'No Pod found for your account',
    POD_UNREACHABLE: "Couldn't reach your Pod. This is saved on this device only.",
    SAVE_FAILED: 'Could not save to your Pod. Please try again.',
    SESSION_EXPIRED: 'Your session has expired. Sign in again to keep syncing.',
} as const

export interface PodSyncResult {
    success: boolean
    successCount: number
    failCount: number
    totalCount: number
}

/**
 * Raised when a conditional write is refused because the pod has moved on.
 *
 * Not a failure in any useful sense: it means somebody else wrote to the same
 * resource since we read it, so the copy we were about to push is out of date.
 * The caller re-reads, merges again, and pushes that instead.
 */
export class PodPreconditionFailedError extends Error {
    constructor(public readonly fileUrl: string) {
        super(`The Pod copy of ${fileUrl} changed since it was read.`)
        this.name = 'PodPreconditionFailedError'
    }
}

/** Raised for a 401/403, which means the session rather than the request. */
export class AuthenticationError extends Error {
    constructor(message: string, public originalError?: unknown) {
        super(message)
        this.name = 'AuthenticationError'
    }
}

export function isAuthenticationError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false
    const statusCode = (error as { statusCode?: unknown }).statusCode
    return statusCode === 401 || statusCode === 403
}

/** Converts an auth failure into an `AuthenticationError`; rethrows the rest. */
export function handlePodError(error: unknown): never {
    if (isAuthenticationError(error)) {
        throw new AuthenticationError(POD_ERROR_MESSAGES.SESSION_EXPIRED, error)
    }
    throw error
}

function getStatusCode(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null) return undefined
    const code = (err as { statusCode?: unknown }).statusCode
    return typeof code === 'number' ? code : undefined
}

// ── Naming a pod and its owner ────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SERVICE_SUBDOMAINS = new Set(['storage', 'pod', 'pods', 'www', 'app'])

/** A pod URL as something a person would recognise — "sam on solidcommunity.net". */
export function friendlyPodName(podUrl: string): string {
    try {
        const url = new URL(podUrl)
        const parts = url.hostname.split('.')
        const cleanHostname = parts.length >= 3 && SERVICE_SUBDOMAINS.has(parts[0])
            ? parts.slice(1).join('.')
            : url.hostname

        const firstSegment = url.pathname.split('/').find(s => s.length > 0)
        if (firstSegment && !UUID_RE.test(firstSegment)) {
            return `${firstSegment} on ${cleanHostname}`
        }

        if (parts.length >= 3 && !SERVICE_SUBDOMAINS.has(parts[0])) {
            return `${parts[0]} on ${parts.slice(1).join('.')}`
        }

        return cleanHostname
    } catch {
        return podUrl
    }
}

/**
 * The username a WebID carries, for the places that have to name the signed-in
 * user when their profile card does not — the account menu, which would
 * otherwise have a raw WebID to show and nothing else.
 *
 * The username sits in a different place in each shape of WebID, so each is
 * tried in turn: the segment before `/profile/card` for a WebID stored inside
 * its own pod, the last path segment for one minted by an identity provider,
 * then the subdomain for a per-user host. A host with no user in it anywhere is
 * the host itself — "example.org" says less than a name, but it is true, and
 * shorter than the WebID it stands in for.
 */
export function podUsernameFromWebId(webId: string): string | null {
    try {
        const url = new URL(webId)
        const segments = url.pathname.split('/').filter(s => s.length > 0)

        const last = segments[segments.length - 1]
        if (segments.length >= 3 && segments[segments.length - 2] === 'profile' && last === 'card') {
            return segments[segments.length - 3]
        }
        if (segments.length >= 1 && last !== 'card') {
            return last
        }

        const parts = url.hostname.split('.')
        if (parts.length >= 3 && !SERVICE_SUBDOMAINS.has(parts[0])) return parts[0]
        if (parts.length >= 3 && SERVICE_SUBDOMAINS.has(parts[0])) return parts.slice(1).join('.')
        return url.hostname
    } catch {
        return null
    }
}

/**
 * Derives the pod root from a WebID that lives inside the pod it describes —
 * the `.../profile/card#me` convention used by CSS and NSS.
 *
 * Null for every other shape. A WebID minted by an identity provider (e.g.
 * `https://id.inrupt.com/sam`) says nothing about where that user's storage
 * lives — it is on a different host entirely — and guessing a pod root from it
 * sends every read and write to the identity provider, which 404s.
 */
export function derivePodUrlFromWebId(webId: string): string | null {
    try {
        const url = new URL(webId)
        url.hash = ''
        const path = url.pathname
        if (path.endsWith('/profile/card')) {
            url.pathname = path.slice(0, -'profile/card'.length)
            return url.toString()
        }
    } catch { /* not a URL we can read */ }
    return null
}

// ── Profiles ──────────────────────────────────────────────────────────────────

const FOAF = 'http://xmlns.com/foaf/0.1/'
const VCARD = 'http://www.w3.org/2006/vcard/ns#'

/** What a Solid profile card is asked for, and all it is asked for. */
export interface SolidProfile {
    name: string | null
    /** Absolute URL of the profile photo, if the card names one. */
    photo: string | null
}

const EMPTY_PROFILE: SolidProfile = { name: null, photo: null }

/**
 * Profile cards already fetched, or in flight, keyed by WebID and by whether
 * the request carried a session — an anonymous miss on a card that turns out to
 * be private must not stand in for the answer a signed-in read would give.
 *
 * Promises are cached rather than results, so concurrent callers share one
 * request instead of racing to start their own. Failures are cached too, as an
 * empty profile: a WebID that does not resolve will not start resolving because
 * a component re-mounted, and retrying on every render is how you get a request
 * storm out of a typo.
 */
const profileCache = new Map<string, Promise<SolidProfile>>()

export function clearSolidProfileCache(): void {
    profileCache.clear()
}

/**
 * Reads a WebID's profile card: their name, and their photo.
 *
 * Three predicates are tried for the photo because three are in use in the
 * wild — `vcard:hasPhoto` is what the Solid profile editors write, `foaf:img`
 * is what older pods have, and `foaf:depiction` is what some hand-written cards
 * use. First one present wins.
 */
export async function getSolidProfile(
    session: Session | null | undefined,
    webId: string,
): Promise<SolidProfile> {
    const key = `${webId}|${session ? 'auth' : 'anon'}`
    const cached = profileCache.get(key)
    if (cached) return cached

    const profileCardUrl = webId.replace(/#.*$/, '')
    const pending = (async (): Promise<SolidProfile> => {
        try {
            const dataset = await getSolidDataset(
                profileCardUrl,
                session ? { fetch: session.fetch } : undefined,
            )
            const card = getThing(dataset, webId)
            if (!card) return EMPTY_PROFILE
            const photo =
                getUrl(card, `${VCARD}hasPhoto`) ??
                getUrl(card, `${FOAF}img`) ??
                getUrl(card, `${FOAF}depiction`)
            return {
                name: getStringNoLocale(card, `${FOAF}name`) ?? null,
                photo: photo ?? null,
            }
        } catch {
            return EMPTY_PROFILE
        }
    })()

    profileCache.set(key, pending)
    return pending
}

// ── Where the pod is ──────────────────────────────────────────────────────────

const POD_URL_CACHE_PREFIX = 'pod-url:'

function readCachedPodUrl(webId: string): string | null {
    try {
        return localStorage.getItem(`${POD_URL_CACHE_PREFIX}${webId}`)
    } catch {
        return null
    }
}

function cachePodUrl(webId: string, podUrl: string): void {
    try {
        localStorage.setItem(`${POD_URL_CACHE_PREFIX}${webId}`, podUrl)
    } catch { /* storage unavailable — caching is best-effort */ }
}

/**
 * Why the app could not work out where a user's pod lives.
 *
 * The distinction is the whole point: `profile-unreachable` and `no-session`
 * describe a moment, and the next attempt may well succeed, so they belong in
 * the console rather than in the user's face or in Sentry.
 * `no-storage-declared` is a settled fact about the account that will never fix
 * itself.
 */
export type PodUrlUnavailableReason = 'no-session' | 'profile-unreachable' | 'no-storage-declared'

const POD_URL_UNAVAILABLE_MESSAGES: Record<PodUrlUnavailableReason, string> = {
    'no-session': POD_ERROR_MESSAGES.NOT_LOGGED_IN,
    'profile-unreachable': POD_ERROR_MESSAGES.POD_UNREACHABLE,
    'no-storage-declared': POD_ERROR_MESSAGES.NO_POD_FOUND,
}

/**
 * Thrown when a pod read or write cannot start because the pod's location is
 * unknown. It carries the reason so callers can tell a blip from a dead end.
 */
export class PodUrlUnavailableError extends Error {
    constructor(public readonly reason: PodUrlUnavailableReason) {
        super(POD_URL_UNAVAILABLE_MESSAGES[reason])
        this.name = 'PodUrlUnavailableError'
    }
}

/** True for an unknown pod location that a later attempt can still resolve. */
export function isRetryablePodUrlFailure(error: unknown): boolean {
    return error instanceof PodUrlUnavailableError && error.reason !== 'no-storage-declared'
}

export interface PodUrlResolution {
    podUrl: string | null
    /** Set only when `podUrl` is null. */
    reason?: PodUrlUnavailableReason
}

/**
 * The pod URL resolved for each WebID this session has asked about, requests in
 * flight included. Cleared by `resetPodSessionCaches`.
 */
const podUrlByWebId = new Map<string, Promise<PodUrlResolution>>()

/**
 * Containers this session has already established are there. A container that
 * exists doesn't stop existing while the app is open, and the check is a round
 * trip in front of every single write.
 */
const knownContainers = new Set<string>()

/**
 * Forget everything cached for the length of a session: which pod a WebID lives
 * in, which containers are known to exist, and whose profile is whose. Call
 * this when the identity behind the session changes, or when pod data is
 * deleted underneath us.
 */
export function resetPodSessionCaches(): void {
    podUrlByWebId.clear()
    knownContainers.clear()
    clearSolidProfileCache()
    lastSeenByUrl.clear()
}

/**
 * Where a user's pod lives, or why we don't know.
 *
 * The `pim:storage` triple in the WebID profile is the only authoritative
 * source, so an unreadable profile means "unknown", never "guess from the WebID
 * host".
 */
export async function resolvePodUrl(session: Session | null): Promise<PodUrlResolution> {
    if (!session || !session.info.isLoggedIn || !session.info.webId) {
        return { podUrl: null, reason: 'no-session' }
    }

    const webId = session.info.webId

    // Reading the profile is a network round trip, and this is called before
    // every pod read and every pod write. The answer is a property of the
    // WebID, so resolve it once per session and share the in-flight request
    // with anyone who asks while it is still running.
    const inFlight = podUrlByWebId.get(webId)
    if (inFlight) return inFlight

    const attempt = resolvePrimaryPodUrl(session, webId)
    const resolution = attempt.then(result => result.resolution)
    podUrlByWebId.set(webId, resolution)
    // Only an answer actually read from the profile is worth keeping for the
    // session. A fallback — or a failure — says nothing about where the pod is,
    // and caching it would leave the app stuck on one dropped request.
    attempt.then(
        result => { if (!result.authoritative) podUrlByWebId.delete(webId) },
        () => podUrlByWebId.delete(webId),
    )
    return resolution
}

export async function getPrimaryPodUrl(session: Session | null): Promise<string | null> {
    return (await resolvePodUrl(session)).podUrl
}

/**
 * The storage locations a WebID profile advertises.
 *
 * A WebID profile document is public by design — it is what an unauthenticated
 * client reads to discover where a pod lives — so when the *authenticated* read
 * fails, the token is the likeliest culprit: an access token that expired
 * between the check and the request, a DPoP nonce race, a refresh still in
 * flight. A plain fetch of the same document sidesteps all of those, and costs
 * one request in the only case where we would otherwise have given up. That
 * matters because giving up here does not just skip a poll: it drops a save.
 */
async function readPodUrlsFromProfile(session: Session, webId: string): Promise<string[]> {
    try {
        return await profile('pod.getPrimaryPodUrl', () => getPodUrlAll(webId, { fetch: session.fetch }), { webId })
    } catch (err) {
        console.warn('getPrimaryPodUrl: authenticated profile read failed, retrying unauthenticated', err)
        return await profile('pod.getPrimaryPodUrl.unauthenticated', () => getPodUrlAll(webId), { webId })
    }
}

/**
 * `authoritative` marks an answer that came from the profile itself, as opposed
 * to a last-known-good fallback — only the former is worth remembering.
 */
async function resolvePrimaryPodUrl(
    session: Session,
    webId: string,
): Promise<{ resolution: PodUrlResolution; authoritative: boolean }> {
    let podUrls: string[]
    try {
        podUrls = await readPodUrlsFromProfile(session, webId)
    } catch (err) {
        console.warn('getPrimaryPodUrl: could not read the WebID profile', err)
        return { resolution: fallbackResolution(webId, 'profile-unreachable'), authoritative: false }
    }

    if (podUrls && podUrls.length > 0) {
        cachePodUrl(webId, podUrls[0])
        return { resolution: { podUrl: podUrls[0] }, authoritative: true }
    }

    // Profile was readable but declares no pim:storage — the case for CSS v7,
    // where the WebID sits inside the pod it belongs to.
    const derivedPodUrl = derivePodUrlFromWebId(webId)
    if (derivedPodUrl) {
        cachePodUrl(webId, derivedPodUrl)
        return { resolution: { podUrl: derivedPodUrl }, authoritative: true }
    }

    return { resolution: fallbackResolution(webId, 'no-storage-declared'), authoritative: false }
}

function fallbackResolution(webId: string, reason: PodUrlUnavailableReason): PodUrlResolution {
    const cached = readCachedPodUrl(webId)
    return cached ? { podUrl: cached } : { podUrl: null, reason }
}

async function ensureContainerExists(session: Session, containerUrl: string): Promise<void> {
    if (knownContainers.has(containerUrl)) return
    try {
        await getSolidDataset(containerUrl, { fetch: session.fetch })
        knownContainers.add(containerUrl)
    } catch (err) {
        const status = getStatusCode(err)
        // No read access — assume it exists and let the write reveal any real problem.
        if (status === 401 || status === 403) {
            knownContainers.add(containerUrl)
            return
        }
        if (status !== 404) throw err
        try {
            await createContainerAt(containerUrl, { fetch: session.fetch })
            knownContainers.add(containerUrl)
        } catch (createErr) {
            // 409 Conflict = created concurrently; that is a success for us.
            if (getStatusCode(createErr) !== 409) throw createErr
            knownContainers.add(containerUrl)
        }
    }
}

// ── Reading and writing RDF ───────────────────────────────────────────────────

/**
 * Last-seen ETag plus the deserialized result per URL, so a poll that finds
 * nothing changed can skip both the RDF parse and the deserializer entirely.
 */
const lastSeenByUrl = new Map<string, { etag: string; result: unknown }>()

/**
 * Loads an RDF document from a pod URL and deserializes it.
 *
 * Sends a conditional GET (`If-None-Match` against the ETag of whatever was
 * last parsed from this URL) so a poll that finds nothing changed gets a
 * body-less 304 instead of the whole resource. Parsing Turtle into a
 * SolidDataset is real main-thread work, and the Today page polls on a timer —
 * paying for it on every tick when the pod has not changed is waste the user
 * feels on a phone.
 *
 * A 304 makes `responseToDataset` throw before it reaches the parser, which is
 * exactly the point: the cached result from last time is still correct and is
 * returned instead. That only works because `PodResponseError` carries a
 * `statusCode` for a 304 — @inrupt/solid-client's own `FetchError` cannot be
 * built for a status below 400, so going through `getSolidDataset` would hand
 * back an error with nothing to match on and the cache would never hit.
 */
export async function loadRdfFromPod<T>(
    session: Session | null,
    fileUrl: string,
    deserializer: (dataset: SolidDataset, datasetUrl: string) => T,
): Promise<T> {
    const fetchFn = session?.fetch ?? globalThis.fetch
    const lastSeen = lastSeenByUrl.get(fileUrl)
    let observedEtag: string | null = null
    const conditionalFetch: typeof fetch = (input, init) => {
        const headers = new Headers(init?.headers)
        if (lastSeen) headers.set('If-None-Match', lastSeen.etag)
        return fetchFn(input, { ...init, headers }).then(response => {
            observedEtag = response.headers.get('etag')
            return response
        })
    }
    try {
        const response = await profile('pod.load.fetch', () => conditionalFetch(fileUrl, { headers: { Accept: 'text/turtle' } }), { fileUrl })
        const dataset = await profile('pod.load.parse', () => responseToDataset(response), { fileUrl })
        const result = profile('pod.load.deserialize', () => deserializer(dataset, fileUrl), { fileUrl })
        if (observedEtag) lastSeenByUrl.set(fileUrl, { etag: observedEtag, result })
        else lastSeenByUrl.delete(fileUrl)
        return result
    } catch (error: unknown) {
        if (getStatusCode(error) === 304 && lastSeen) return lastSeen.result as T
        if (session && isAuthenticationError(error)) handlePodError(error)
        throw error
    }
}

/**
 * The ETag of the copy `loadRdfFromPod` last parsed from this URL, if any.
 *
 * This is what makes a safe read-merge-write possible: pass it back as
 * `ifMatch` and the write is refused rather than applied if the pod has
 * changed in between.
 */
export function lastSeenEtag(fileUrl: string): string | undefined {
    return lastSeenByUrl.get(fileUrl)?.etag
}

export interface SaveRdfToPodOptions<T> {
    session: Session | null
    fileUrl: string
    data: T
    serializer: (data: T, datasetUrl: string) => SolidDataset
    /**
     * Write only if the pod's copy still has this ETag.
     *
     * Used for a write that is a *merge of what the pod had* — where applying
     * it blindly would discard whatever arrived in the meantime. A plain
     * user-initiated save deliberately does not set this: the person pressing
     * Save is the authority on their own entry, and anything of somebody
     * else's that it overwrites is restored by their next merge.
     */
    ifMatch?: string
}

/**
 * Serializes to Turtle and saves it as a full PUT.
 *
 * `overwriteFile` rather than a SPARQL PATCH: CSS v7 produces truncated Turtle
 * when a PATCH adds new triples, and a month document grows a triple every time
 * a happy is written.
 */
export async function saveRdfToPod<T>(options: SaveRdfToPodOptions<T>): Promise<void> {
    const { session, fileUrl, data, serializer, ifMatch } = options
    const baseFetch = session?.fetch ?? globalThis.fetch
    // The condition rides on the request rather than being checked first: a
    // read-then-write would have its own race in the gap between the two.
    const fetchFn: typeof fetch = ifMatch
        ? (input, init) => {
            const headers = new Headers(init?.headers)
            headers.set('If-Match', ifMatch)
            return baseFetch(input, { ...init, headers })
        }
        : baseFetch
    try {
        if (session) {
            const containerUrl = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1)
            await profile('pod.save.ensureContainer', () => ensureContainerExists(session, containerUrl), { containerUrl })
        }
        const newDataset = profile('pod.save.serialize', () => serializer(data, fileUrl))
        const turtleContent = await profile('pod.save.turtle', () => solidDatasetAsTurtle(newDataset))
        const blob = new Blob([turtleContent], { type: 'text/turtle' })
        await profile('pod.save.put', () => overwriteFile(fileUrl, blob, { fetch: fetchFn, contentType: 'text/turtle' }), { fileUrl, bytes: turtleContent.length })
        // The copy on the pod is now ours, and the ETag we were holding is
        // stale. Dropping it stops the next poll from answering a 304 with the
        // version from before this write.
        lastSeenByUrl.delete(fileUrl)
    } catch (error: unknown) {
        if (getStatusCode(error) === 412) {
            // Somebody else wrote first. Our copy is stale, not wrong — drop
            // the cached ETag so the next read is unconditional and sees theirs.
            lastSeenByUrl.delete(fileUrl)
            throw new PodPreconditionFailedError(fileUrl)
        }
        if (session && isAuthenticationError(error)) handlePodError(error)
        throw error
    }
}

/** The fetch half of `getSolidDataset`, leaving the parse to the caller. */
function fetchTurtle(session: Session, fileUrl: string): Promise<Response> {
    return session.fetch(fileUrl, { headers: { Accept: 'text/turtle' } })
}

export async function deleteFileFromPod(session: Session, fileUrl: string): Promise<void> {
    try {
        await deleteFile(fileUrl, { fetch: session.fetch })
        lastSeenByUrl.delete(fileUrl)
    } catch (error) {
        if (isAuthenticationError(error)) handlePodError(error)
        if (getStatusCode(error) === 404) return
        throw error
    }
}

/**
 * Every `.ttl` in a pod container, deserialized.
 *
 * The fetches go out in parallel — one round trip per month adds up to a long
 * wait on the first sign-in for anyone with a year of happies — but the
 * responses are turned into datasets one at a time, giving the browser a turn
 * in between.
 *
 * The split is the point. `getSolidDataset` does the fetch and the Turtle parse
 * in one call, so firing it at a whole container means every response parses as
 * it lands, back to back, in a single task — with the app already on screen and
 * unable to repaint. Parsing is the expensive half and it is main-thread CPU,
 * so it is the half that gets spread out. The network stays exactly as parallel
 * as it was.
 */
export async function loadMultipleRdfFromPod<T>(
    session: Session,
    containerUrl: string,
    deserializer: (dataset: SolidDataset, datasetUrl: string) => T,
    onError?: (fileUrl: string, error: Error) => void,
): Promise<{ data: T[]; result: PodSyncResult }> {
    let dataset
    try {
        dataset = await getSolidDataset(containerUrl, { fetch: session.fetch })
    } catch (error: unknown) {
        if (isAuthenticationError(error)) handlePodError(error)
        if (getStatusCode(error) === 404) {
            // The container has not been created yet — a pod nobody has written
            // to. Not a failure, just nothing there.
            return { data: [], result: { success: true, successCount: 0, failCount: 0, totalCount: 0 } }
        }
        throw error
    }

    const ttlUrls = getContainedResourceUrlAll(dataset).filter(url => url.endsWith('.ttl'))
    if (ttlUrls.length === 0) {
        return { data: [], result: { success: true, successCount: 0, failCount: 0, totalCount: 0 } }
    }

    // Settled results stay in ttlUrls order, so the caller sees container order
    // regardless of which responses arrive first.
    const settled = await Promise.allSettled(
        ttlUrls.map(fileUrl => profile('pod.loadMany.fetch', () => fetchTurtle(session, fileUrl), { fileUrl })),
    )

    const loadedData: T[] = []
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < settled.length; i++) {
        const outcome = settled[i]
        const fileUrl = ttlUrls[i]
        try {
            if (outcome.status === 'rejected') throw outcome.reason
            // Parsing and deserialization stay inside the try: a malformed file
            // must count as one failure, not abandon the rest of the container.
            const fileDataset = await profile('pod.loadMany.parse', () => responseToDataset(outcome.value), { fileUrl })
            loadedData.push(profile('pod.loadMany.deserialize', () => deserializer(fileDataset, fileUrl), { fileUrl }))
            successCount++
        } catch (error: unknown) {
            if (isAuthenticationError(error)) handlePodError(error)
            console.error(`loadMultipleRdfFromPod: error loading ${fileUrl}`, error)
            failCount++
            onError?.(fileUrl, error instanceof Error ? error : new Error(String(error)))
        }
        await yieldToEventLoop()
    }

    return {
        data: loadedData,
        result: { success: failCount === 0, successCount, failCount, totalCount: ttlUrls.length },
    }
}

// ── Full sync ─────────────────────────────────────────────────────────────────

export interface SyncAllResult {
    /** Months whose pod copy brought something this device did not have. */
    monthsDownloaded: number
    /** Months whose local copy had something the pod did not. */
    monthsUploaded: number
    /** True if the pod's settings were newer and were taken. */
    settingsSynced: boolean
}

/** The pod URL for one month's document. */
export function monthFileUrl(podUrl: string, monthKey: string): string {
    return `${podUrl}${POD_CONTAINERS.MONTHS}${monthKey}.ttl`
}

/**
 * Reconciles the pod and this device, in both directions.
 *
 * Every month is merged rather than one side winning, because both sides are
 * writable and a happy written on either must survive (see
 * `mergeHappyMonths`). The consequences of that, in order:
 *
 * - A month only the pod has is saved locally.
 * - A month only this device has is uploaded — the "I wrote these before I
 *   signed in, or while I had no signal" case.
 * - A month both have is merged, saved locally, and pushed back **only when the
 *   merge differs from what the pod already holds**. Without that check every
 *   sign-in rewrites every month, which on a pod with two years of happies is
 *   24 pointless PUTs and a changed `lastModified` on documents nothing edited.
 *
 * A 404 anywhere is "nothing there yet" and is not an error. A 401/403 is the
 * session and is rethrown immediately — retrying the remaining months with a
 * dead token would just be a slower failure. Everything else is logged and
 * skipped, so one bad month does not cost the user the rest of their journal.
 */
export async function syncAllDataFromPod(
    session: Session,
    podUrl: string,
    db: HappyTrackDatabase,
): Promise<SyncAllResult> {
    let monthsDownloaded = 0
    let monthsUploaded = 0
    let settingsSynced = false

    const containerUrl = `${podUrl}${POD_CONTAINERS.MONTHS}`

    const [podMonthsResult, podSettingsResult] = await Promise.allSettled([
        loadMultipleRdfFromPod<HappyMonth>(session, containerUrl, datasetToHappyMonth),
        loadRdfFromPod<HappySettings>(session, `${podUrl}${POD_CONTAINERS.SETTINGS}`, datasetToSettings),
    ])

    // ── Settings ─────────────────────────────────────────────────────────────
    // Last write wins here, unlike the months: these are a handful of
    // independent switches, and the most recent answer to "show the mood
    // picker?" is simply the user's current answer. There is nothing to merge.
    const settingsUrl = `${podUrl}${POD_CONTAINERS.SETTINGS}`
    try {
        const localSettings = await db.getSettings()
        const podSettings = podSettingsResult.status === 'fulfilled' ? podSettingsResult.value : null

        if (podSettingsResult.status === 'rejected') {
            const err = podSettingsResult.reason
            if (err instanceof AuthenticationError) throw err
            if (getStatusCode(err) !== 404) {
                console.error('syncAllDataFromPod: error loading settings', err)
            }
            // 404 = no settings on the pod yet.
        }

        const podTime = podSettings?.lastModified ? new Date(podSettings.lastModified).getTime() : 0
        const localTime = localSettings?.lastModified ? new Date(localSettings.lastModified).getTime() : 0

        if (podSettings && (!localSettings || podTime > localTime)) {
            await db.saveSettings({ ...podSettings, _rev: undefined })
            settingsSynced = true
        } else if (localSettings && localTime > podTime) {
            // Chosen on this device before signing in, or while offline.
            await saveRdfToPod({
                session,
                fileUrl: settingsUrl,
                data: localSettings,
                serializer: settingsToDataset,
            })
        }
    } catch (err) {
        if (err instanceof AuthenticationError) throw err
        console.error('syncAllDataFromPod: error syncing settings', err)
    }

    // ── Months ───────────────────────────────────────────────────────────────
    if (podMonthsResult.status === 'rejected') {
        const err = podMonthsResult.reason
        if (err instanceof AuthenticationError) throw err
        console.error('syncAllDataFromPod: error loading months', err)
        return { monthsDownloaded, monthsUploaded, settingsSynced }
    }

    const podMonths = podMonthsResult.value.data.filter(month => {
        if (isMonthKey(month.month)) return true
        // A `.ttl` in the container that isn't a month — something else wrote
        // it, or a filename got mangled. Reading it as a month would file
        // entries under a key nothing looks up.
        console.warn(`syncAllDataFromPod: ignoring non-month document "${month.month}"`)
        return false
    })
    const podMonthKeys = new Set(podMonths.map(month => month.month))

    for (const podMonth of podMonths) {
        try {
            const localMonth = await db.getMonth(podMonth.month)
            const resolved = localMonth ? mergeHappyMonths(localMonth, podMonth) : podMonth

            if (!localMonth || !monthsEqual(resolved, localMonth)) {
                await db.saveMonth({ ...resolved, _rev: undefined })
                monthsDownloaded++
            }

            // Push back only a merge that actually adds something the pod does
            // not have — see the note above.
            if (!monthsEqual(resolved, podMonth)) {
                await saveRdfToPod({
                    session,
                    fileUrl: monthFileUrl(podUrl, podMonth.month),
                    data: resolved,
                    serializer: happyMonthToDataset,
                })
                monthsUploaded++
            }
        } catch (err) {
            if (err instanceof AuthenticationError) throw err
            console.error(`syncAllDataFromPod: error reconciling ${podMonth.month}`, err)
        }
        await yieldToEventLoop()
    }

    // Months this device has that the pod has never seen.
    for (const localMonth of await db.getAllMonths()) {
        if (podMonthKeys.has(localMonth.month)) continue
        try {
            await saveRdfToPod({
                session,
                fileUrl: monthFileUrl(podUrl, localMonth.month),
                data: localMonth,
                serializer: happyMonthToDataset,
            })
            monthsUploaded++
        } catch (err) {
            if (err instanceof AuthenticationError) throw err
            console.error(`syncAllDataFromPod: error uploading ${localMonth.month}`, err)
        }
        await yieldToEventLoop()
    }

    return { monthsDownloaded, monthsUploaded, settingsSynced }
}

/** Whether this pod holds any Happy Track data at all. */
export async function hasPodData(session: Session, podUrl: string): Promise<boolean> {
    try {
        const dataset = await getSolidDataset(`${podUrl}${POD_CONTAINERS.MONTHS}`, { fetch: session.fetch })
        if (getContainedResourceUrlAll(dataset).some(url => url.endsWith('.ttl'))) return true
    } catch (err: unknown) {
        if (isAuthenticationError(err)) handlePodError(err)
        if (getStatusCode(err) !== 404) throw err
    }

    try {
        await getSolidDataset(`${podUrl}${POD_CONTAINERS.SETTINGS}`, { fetch: session.fetch })
        return true
    } catch (err: unknown) {
        if (isAuthenticationError(err)) handlePodError(err)
        if (getStatusCode(err) === 404) return false
        throw err
    }
}

/** Every month document the pod holds, by key. For backups and deletion. */
export async function listPodMonthKeys(session: Session, podUrl: string): Promise<string[]> {
    try {
        const dataset = await getSolidDataset(`${podUrl}${POD_CONTAINERS.MONTHS}`, { fetch: session.fetch })
        return getContainedResourceUrlAll(dataset)
            .filter(url => url.endsWith('.ttl'))
            .map(url => url.split('/').pop()!.replace(/\.ttl$/, ''))
            .filter(isMonthKey)
    } catch (err: unknown) {
        if (isAuthenticationError(err)) handlePodError(err)
        if (getStatusCode(err) === 404) return []
        throw err
    }
}
