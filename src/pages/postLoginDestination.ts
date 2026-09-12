/**
 * Where to send someone once the OIDC round trip lands.
 *
 * Sign-in returns you to where you started, and that is the point of it:
 * someone who opened a link to a particular month, or was part-way through
 * writing, has to land back there rather than on the app's front door. But the
 * neutral entry points carry no such intent — signing in from the button in the
 * nav bar stores `/home`, and restoring that drops the user back on the
 * marketing page they were trying to get past.
 *
 * So the substitution is scoped to those neutral routes, and every other stored
 * route is restored untouched.
 */

/**
 * Routes that mean "wherever the app happened to open", not "take me back
 * here".
 *
 * `/solid-pod-handle-redirect` is one of them: it is where the neutral case is
 * sent, and it re-reads the stored route on arrival, so leaving it out would
 * let the substitution point at itself.
 */
const NEUTRAL_AUTH_RETURN_ROUTES = ['', '/home', '/solid-pod-handle-redirect']

export const isNeutralAuthReturnRoute = (route: string | null | undefined): boolean => {
    if (!route) return true
    // Compare paths only — a stored `/home?utm=x` is still the home page — and
    // let `/` and `/home/` normalise onto the same entries as `` and `/home`.
    const path = route.split(/[?#]/)[0].replace(/\/+$/, '')
    return NEUTRAL_AUTH_RETURN_ROUTES.includes(path)
}

/**
 * Where someone with no route of their own is sent.
 *
 * Always Today, new user or old. Today is both the thing the app is for and its
 * own empty state — a first-time visitor lands on the box they are meant to
 * type in, which is a better welcome than a page explaining that they could.
 */
export const POST_LOGIN_ROUTE = '/today'
