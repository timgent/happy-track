import { useEffect, useState } from 'react'

function currentlyOnline(): boolean {
    // `undefined` where the browser does not report connectivity at all.
    return navigator.onLine ?? true
}

/**
 * Whether the device thinks it has a connection.
 *
 * Only ever used to *word* things — "you're offline" versus "can't reach your
 * Pod" — never to decide what the app will attempt. `navigator.onLine` says the
 * device has a network interface with a route, not that anything is reachable:
 * a captive portal, a dead Wi-Fi or a pod that is down are all "online". What
 * the app does about a failed request is decided by the request failing.
 */
export function useOnlineStatus(): boolean {
    const [isOnline, setIsOnline] = useState(currentlyOnline)

    useEffect(() => {
        const update = () => setIsOnline(currentlyOnline())
        window.addEventListener('online', update)
        window.addEventListener('offline', update)
        // The listeners can have missed a change between first render and here.
        update()
        return () => {
            window.removeEventListener('online', update)
            window.removeEventListener('offline', update)
        }
    }, [])

    return isOnline
}
