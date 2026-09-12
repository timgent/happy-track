import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'

/**
 * Runs `handler` whenever the app comes back to the foreground.
 *
 * This is the moment a Solid session most needs looking at. A phone that has
 * been asleep for an hour has a lapsed access token and a renewal timer that
 * never fired, because the WebView's timers were frozen with the process.
 * Something has to notice on the way back in, or the app sits on a dead token
 * until the user happens to trigger a request.
 *
 * On the web `visibilitychange` is that signal. In the native shell it is not
 * dependable: an Android WebView whose activity is paused and resumed does not
 * always report a document visibility change, so the App plugin's own
 * `appStateChange` is the event that actually arrives. Both are wired up, and
 * both paths are idempotent — a session that needs no renewal is left alone —
 * so hearing twice about one resume costs nothing.
 */
export function onAppResumed(handler: () => void): () => void {
    const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') handler()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Resolves to the plugin's handle; kept so unsubscribing can await it rather
    // than leak a listener registered after the caller has gone away.
    const nativeListener = Capacitor.isNativePlatform()
        ? CapacitorApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) handler()
        })
        : undefined

    return () => {
        document.removeEventListener('visibilitychange', onVisibilityChange)
        void nativeListener?.then(listener => listener.remove()).catch(() => {
            // Nothing to unhook — the plugin never attached.
        })
    }
}
