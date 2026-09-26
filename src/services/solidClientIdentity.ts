/**
 * Which OIDC client this app presents itself as.
 *
 * Solid-OIDC offers two ways to be a client, and they age very differently:
 *
 * - A **Client ID Document** hosted at an https URL. The provider fetches it on
 *   every grant, so the registration is as permanent as the file. Nothing about
 *   it can lapse.
 * - A **dynamic registration**, created at login. The provider hands back a
 *   client id it owns and may reclaim — Inrupt's ESS expires them, and a
 *   Community Solid Server drops them whenever its registration storage is
 *   cleared. When that happens the next refresh comes back `invalid_client`.
 *   That is terminal by definition (the app is no longer a client the provider
 *   knows), so the user is signed out with a perfectly good refresh token still
 *   on disk, and no amount of retrying helps.
 *
 * The native shell is served from `https://localhost` by Capacitor, so it never
 * matched the hosted document's redirect URI and fell through to dynamic
 * registration on every install — which is why phones lost their session on a
 * schedule the web app never saw. `public/client-id.json` now lists the
 * loopback redirect URI, and the native app uses the hosted document like the
 * deployed site does.
 */

/**
 * The deployed Client ID Document.
 *
 * Hardcoded on purpose: the native app has no deployment origin to derive this
 * from — `window.location.origin` inside the shell is `https://localhost`, and a
 * provider cannot fetch a client document from a phone. `VITE_CLIENT_ID_URL`
 * still overrides it, which is how a preview build is tested natively.
 */
export const HOSTED_CLIENT_ID_URL = 'https://happytrack.tim-gent.com/client-id.json'

/**
 * The origin that serves the hosted document — the deployed site itself. A page
 * loaded from here is the client the document describes, whatever the build was
 * told; production ran as a dynamic client for four days because a build
 * variable was missing, and every session signed in then ended `invalid_client`.
 */
export const HOSTED_CLIENT_ORIGIN = new URL(HOSTED_CLIENT_ID_URL).origin

/**
 * The redirect URI the native shell sends. Capacitor serves the app over its
 * https scheme on both platforms (see `capacitor.config.ts`), so iOS and Android
 * share one loopback origin. `public/client-id.json` must list this, or the
 * provider refuses the login outright.
 */
export const NATIVE_REDIRECT_URI = 'https://localhost/'

export type SolidClientDetails =
    | { client_id: string }
    | { redirect_uris: string[]; client_name: string }

export function solidClientDetails({
    clientIdUrl,
    isNativePlatform,
    origin,
}: {
    /** `VITE_CLIENT_ID_URL`, when the build sets one. */
    clientIdUrl?: string
    isNativePlatform: boolean
    origin: string
}): SolidClientDetails {
    if (clientIdUrl) return { client_id: clientIdUrl }
    if (isNativePlatform || origin === HOSTED_CLIENT_ORIGIN) return { client_id: HOSTED_CLIENT_ID_URL }

    // Any other web origin has no hosted document — localhost or a preview deploy.
    // Dynamic registration is the only option, and its fragility matters less
    // here: these sessions are minutes old and re-logging in costs nothing.
    //
    // Use the SPA root so the redirect_uri in the token exchange matches what is
    // registered. Going through pod-auth-callback.html would have the library
    // strip the params from that URL and send the wrong redirect_uri.
    return { redirect_uris: [origin + '/'], client_name: 'Happy Track' }
}
