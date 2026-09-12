import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useSolidPod } from '../components/SolidPodContext'
import { LoadingState } from '../components/LoadingState'
import { getPrimaryPodUrl } from '../services/solidPod'
import { openInvocationPath } from '../capability/openInvocation'

/**
 * Where an `#open={open}` invocation lands (src/capability/openInvocation.ts
 * rewrites the fragment to `/open?resource=…` before the router sees it).
 *
 * Its only job is to work out where the visitor actually wanted to go. That
 * needs the signed-in person's own pod URL — this app only opens your own
 * journal, so an IRI has to be checked against your pod before it can be
 * routed — which is why this is a route with a session rather than a pure
 * function.
 */
export function OpenResourcePage() {
    const [searchParams] = useSearchParams()
    const resource = searchParams.get('resource')
    const { isLoggedIn, session, isLoading } = useSolidPod()

    // undefined while we still do not know; null means "no pod of your own",
    // which is a real answer and refuses everything.
    const [ownPodUrl, setOwnPodUrl] = useState<string | null | undefined>(undefined)

    useEffect(() => {
        if (isLoading) return
        if (!isLoggedIn || !session) {
            setOwnPodUrl(null)
            return
        }
        let cancelled = false
        getPrimaryPodUrl(session)
            .then(url => { if (!cancelled) setOwnPodUrl(url) })
            .catch(() => { if (!cancelled) setOwnPodUrl(null) })
        return () => { cancelled = true }
    }, [isLoading, isLoggedIn, session])

    if (!resource) return <CannotOpen resource={null} signedIn={isLoggedIn} />

    if (ownPodUrl === undefined) {
        return <LoadingState message="Opening…" rows={1} />
    }

    const path = openInvocationPath(resource, ownPodUrl)
    if (!path) return <CannotOpen resource={resource} signedIn={isLoggedIn} />

    return <Navigate to={path} replace />
}

/**
 * Another app can hand this one any IRI it likes, so "we do not know what that
 * is" has to be an ordinary outcome with an ordinary explanation rather than a
 * blank page. The IRI is shown back, so the person can see what was asked for.
 *
 * Someone not signed in gets a different sentence: their invocation may well
 * have been perfectly good, and "sign in and try again" is the useful thing to
 * say rather than "we cannot open that".
 */
function CannotOpen({ resource, signedIn }: { resource: string | null; signedIn: boolean }) {
    return (
        <div className="mx-auto max-w-2xl space-y-4 py-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                Sorry, we can't open that
            </h1>
            <p className="text-gray-700 dark:text-gray-300">
                {!resource
                    ? 'Nothing was passed for Happy Track to open.'
                    : !signedIn
                        ? 'Happy Track only opens happies from your own Pod, and you are not signed in. Sign in and try that link again.'
                        : 'Happy Track opens months of happies from your own Pod. This is not one of them:'}
            </p>
            {resource && (
                <p className="break-all rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 font-mono text-sm text-gray-800 dark:text-gray-200">
                    {resource}
                </p>
            )}
            <Link
                to="/today"
                className="inline-block font-semibold text-accent-700 dark:text-accent-300 underline hover:no-underline"
            >
                Go to today
            </Link>
        </div>
    )
}
