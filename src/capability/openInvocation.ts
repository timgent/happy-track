/**
 * Handling for the `#open={open}` invocation this app advertises in its
 * Application Capability description (./document.ts).
 *
 * A consumer — a pod browser showing a `ht:HappyMonth`, say — expands the
 * template with the IRI of the resource it wants opened and navigates the user
 * agent to `https://happytrack.tim-gent.com/#open=https%3A%2F%2F…`. The value
 * rides in the fragment on purpose: a fragment is never sent to this app's
 * host, so the IRI of the resource you are opening — and with it the location
 * of your pod — stays between your browser and the pod it lives on. For a
 * journal of personal happies that is not a detail.
 *
 * `#open=…` is not a shape HashRouter can route, so the fragment is rewritten
 * to the app's own `/open` route (src/pages/open-resource.tsx) before the
 * router ever sees it — see `installOpenInvocationHandler`, called from
 * main.tsx. The route then decides where you actually land, which needs to know
 * your own pod URL and so cannot be settled here.
 *
 * The parsing rules come from §5.3.1 of the spec: `&` is the sole pair
 * separator and `=` the sole name/value separator, `;` is not a separator,
 * unrecognised variables are ignored rather than treated as errors, and an
 * absent or unusable value fails safe. Invocation values are untrusted input,
 * so only http(s) IRIs get anywhere near a navigation.
 */
import { POD_CONTAINERS } from '../services/solidPod'
import { isMonthKey } from '../happies/dates'

/** Where the app's own hash routes send an invocation once it is understood. */
export const OPEN_ROUTE = '/open'

/**
 * A pod IRI this app recognises as one of its own resources.
 *
 * `podUrl` keeps its trailing slash, matching every other pod URL in the app
 * (POD_CONTAINERS paths are appended to it directly).
 */
export type HappyTrackResource =
    | { kind: 'month'; podUrl: string; monthKey: string }
    | { kind: 'settings'; podUrl: string }

/**
 * The value of an `#open={open}` invocation's variable, or null if this
 * fragment is not such an invocation at all (the common case — every ordinary
 * in-app hash route lands here too).
 *
 * An empty string means the variable was there but carried nothing usable.
 * That is a different answer from null on purpose: an invocation that arrived
 * empty still deserves the page that says so, rather than a blank screen.
 * Judging the value itself is `resolveHappyTrackResource`'s job.
 */
export function parseOpenInvocation(hash: string): string | null {
    const fragment = hash.startsWith('#') ? hash.slice(1) : hash
    // An in-app route, not an invocation. Bailing here keeps the app's own
    // navigation off this path entirely.
    if (!fragment || fragment.startsWith('/')) return null

    for (const pair of fragment.split('&')) {
        const separator = pair.indexOf('=')
        if (separator === -1) continue
        if (pair.slice(0, separator) !== 'open') continue

        try {
            return decodeURIComponent(pair.slice(separator + 1))
        } catch {
            // A malformed percent-sequence is not something to guess at.
            return ''
        }
    }

    return null
}

const MONTHS_PATH = POD_CONTAINERS.MONTHS
const SETTINGS_PATH = POD_CONTAINERS.SETTINGS

/**
 * Works out what a pod IRI is, from where this app stores things. Anything that
 * is not one of its own resources is not claimed — a capability description
 * that promises to open `ht:HappyMonth` resources should not pretend it can
 * open a stranger's shopping list.
 */
export function resolveHappyTrackResource(iri: string): HappyTrackResource | null {
    // Schemes a pod resource can plausibly live on, and nothing else: the spec
    // asks a receiving application to refuse file:, data: and javascript:
    // before it navigates anywhere near them. `http:` is here for a Community
    // Solid Server on localhost, which is how this app is developed and tested
    // against a real pod.
    if (!/^https?:\/\/./i.test(iri)) return null

    const monthsAt = iri.lastIndexOf(MONTHS_PATH)
    if (monthsAt !== -1) {
        const file = iri.slice(monthsAt + MONTHS_PATH.length)
        const monthKey = file.endsWith('.ttl') ? file.slice(0, -'.ttl'.length) : ''
        // Validated, not merely non-empty: the key goes straight into a route,
        // and `/journal/../..` is not a month.
        if (isMonthKey(monthKey)) {
            return { kind: 'month', podUrl: iri.slice(0, monthsAt), monthKey }
        }
        return null
    }

    const settingsAt = iri.lastIndexOf(SETTINGS_PATH)
    if (settingsAt !== -1 && settingsAt + SETTINGS_PATH.length === iri.length) {
        return { kind: 'settings', podUrl: iri.slice(0, settingsAt) }
    }

    return null
}

/**
 * The in-app route that opens `iri`, given the pod the signed-in person owns
 * (null when that is not known yet or nobody is signed in).
 *
 * Only the signed-in person's own resources resolve. Happy Track has no viewer
 * for somebody else's journal — there is no sharing, by design, because a
 * record of what made you happy is not a thing to hand out by accident — so an
 * IRI in another pod is refused rather than routed somewhere that would 403.
 * The `/open` page says as much.
 */
export function openInvocationPath(iri: string, ownPodUrl: string | null): string | null {
    const resource = resolveHappyTrackResource(iri)
    if (!resource) return null
    if (ownPodUrl === null || resource.podUrl !== ownPodUrl) return null

    return resource.kind === 'month' ? `/journal/${resource.monthKey}` : '/settings'
}

/**
 * The hash to put in place of an invocation fragment, or null to leave the
 * fragment alone. Keeping the IRI in a query parameter means the `/open` route
 * can read it with the router's own tools.
 */
export function rewriteOpenInvocationHash(hash: string): string | null {
    const iri = parseOpenInvocation(hash)
    if (iri === null) return null
    return `#${OPEN_ROUTE}?resource=${encodeURIComponent(iri)}`
}

/**
 * Rewrite an invocation fragment into an app route: once now, and again
 * whenever the fragment changes. Called from main.tsx before the router mounts,
 * so on a cold load the router only ever sees a fragment it can route.
 *
 * The listeners cover a consumer that changes the fragment of an already-open
 * tab, which reloads nothing. That case needs care: a fragment change fires
 * `popstate` as well as `hashchange`, and HashRouter listens on `popstate` — so
 * depending on which listener the browser reaches first, the router may already
 * have tried to route the raw `#open=…` and landed nowhere. Rewriting the
 * history entry does not tell it to look again, so a synthetic `popstate` does.
 * Re-entering here from that event is harmless: the fragment is no longer an
 * invocation by then, so nothing happens the second time.
 */
export function installOpenInvocationHandler(win: Window = window): void {
    const apply = () => {
        const rewritten = rewriteOpenInvocationHash(win.location.hash)
        if (!rewritten) return

        // replaceState, not assignment: the invocation fragment is a delivery
        // mechanism, not a place in the app worth going Back to.
        win.history.replaceState(null, '', rewritten)
        win.dispatchEvent(new PopStateEvent('popstate'))
    }

    apply()
    win.addEventListener('hashchange', apply)
    win.addEventListener('popstate', apply)
}
