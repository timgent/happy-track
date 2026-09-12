import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { isNeutralAuthReturnRoute, POST_LOGIN_ROUTE } from './postLoginDestination'

export const AUTH_RETURN_TO_KEY = 'authReturnTo'

/**
 * Where the OIDC round trip lands, for the sign-ins that had nowhere
 * particular to come back to. It reads the stored route and navigates on.
 *
 * The screen below is deliberately plain: it is on screen for a frame or two.
 */
export const SolidPodHandleRedirectPage = () => {
    const navigate = useNavigate()
    // One navigation is all we ever want, even if the effect runs twice
    // (StrictMode does exactly that in development).
    const hasNavigated = useRef(false)

    useEffect(() => {
        if (hasNavigated.current) return
        hasNavigated.current = true

        const storedRoute = sessionStorage.getItem(AUTH_RETURN_TO_KEY)
        sessionStorage.removeItem(AUTH_RETURN_TO_KEY)
        if (!isNeutralAuthReturnRoute(storedRoute)) {
            navigate(storedRoute!)
            return
        }

        // Covers the case where sessionStorage was never set — a sign-in
        // started in another tab, or storage that threw.
        const paramRoute = new URLSearchParams(window.location.search).get('returnTo')
        if (!isNeutralAuthReturnRoute(paramRoute)) {
            navigate(paramRoute!)
            return
        }

        // Replace: this page was itself reached by a location.replace, and the
        // back button should leave the app rather than bounce through it.
        navigate(POST_LOGIN_ROUTE, { replace: true })
    }, [navigate])

    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
                <h1 className="text-2xl font-bold mb-2">Signing you in…</h1>
                <p className="text-gray-600 dark:text-gray-400">Taking you back to the app.</p>
            </div>
        </div>
    )
}
