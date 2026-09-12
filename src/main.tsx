import './polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '@sentry/react'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.tsx'
import { ErrorFallback } from './components/ErrorFallback.tsx'
import { initSentry } from './sentry.ts'
import { installOpenInvocationHandler } from './capability/openInvocation.ts'

initSentry()

// Before the router mounts: another app may have sent us here with the
// Application Capability `#open={open}` invocation in the fragment, which is
// not a shape HashRouter can route. See src/capability/openInvocation.ts.
installOpenInvocationHandler()

// The native shell draws under the status and gesture bars, so the safe-area
// insets in index.css apply there. A browser tab renders inside the browser's
// own chrome and must not add them — see the .safe-area-* rules.
if (Capacitor.isNativePlatform()) {
    document.documentElement.classList.add('native-app')
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary fallback={ErrorFallback} showDialog>
            <App />
        </ErrorBoundary>
    </StrictMode>,
)
