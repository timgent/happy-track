import { Analytics } from '@vercel/analytics/react'
import { Capacitor } from '@capacitor/core'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Navigation } from './components/Navigation'
import { Footer } from './components/Footer'
import { SessionExpiredBanner } from './components/SessionExpiredBanner'
import { OfflineBanner } from './components/OfflineBanner'
import { UpdateAvailableBanner } from './components/UpdateAvailableBanner'
import { ToastProvider } from './components/ToastContext'
import { ThemeProvider } from './components/ThemeContext'
import { SolidPodProvider, useSolidPod } from './components/SolidPodContext'
import { DatabaseProvider } from './components/DatabaseContext'
import { LandingPage } from './pages/landing-page'
import { TodayPage } from './pages/today'
import { JournalPage } from './pages/journal'
import { InsightsPage } from './pages/insights'
import { SettingsPage } from './pages/settings'
import { YourDataPage } from './pages/your-data'
import { PrivacyPolicyPage } from './pages/privacy-policy'
import { OpenResourcePage } from './pages/open-resource'
import { SolidPodHandleRedirectPage } from './pages/solid-pod-handle-redirect-page'

function DefaultRedirect() {
  const { isLoggedIn, isReconnecting, isLoading } = useSolidPod()
  if (isLoading) return null
  // A signed-in user whose pod is out of reach still opens on Today — they are
  // on the device, and everything they have written is there. Sending them to
  // the marketing page instead is half of what makes being offline look like
  // being signed out.
  return <Navigate to={isLoggedIn || isReconnecting ? '/today' : '/home'} replace />
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SolidPodProvider>
          <DatabaseProvider>
            <HashRouter>
              <Analytics />
              {/* Column layout keeps the footer at the bottom of short pages
                  rather than floating it under the content. */}
              <div className="flex min-h-screen flex-col bg-gradient-to-br from-primary-50 via-white to-accent-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
                <Navigation />
                <SessionExpiredBanner />
                <OfflineBanner />
                {/* The native shells serve their bundle from the device and
                    register no service worker (see src/pwa/pwaPlugin.ts), so
                    there is never anything for this banner to say there. */}
                {!Capacitor.isNativePlatform() && <UpdateAvailableBanner />}
                <div className="container mx-auto flex-1 px-4 py-8">
                  <Routes>
                    <Route path="/" element={<DefaultRedirect />} />
                    <Route path="/home" element={<LandingPage />} />
                    <Route path="/today" element={<TodayPage />} />
                    <Route path="/journal" element={<JournalPage />} />
                    <Route path="/journal/:month" element={<JournalPage />} />
                    <Route path="/insights" element={<InsightsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/your-data" element={<YourDataPage />} />
                    <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                    {/* Where another app's `#open={open}` invocation lands —
                        see src/capability/openInvocation.ts. */}
                    <Route path="/open" element={<OpenResourcePage />} />
                    <Route path="/solid-pod-handle-redirect" element={<SolidPodHandleRedirectPage />} />
                    {/* A route that does not exist is not worth a page of its
                        own: send it to the default, which picks between Today
                        and the front door by whether anyone is signed in. */}
                    <Route path="*" element={<DefaultRedirect />} />
                  </Routes>
                </div>
                <Footer />
              </div>
            </HashRouter>
          </DatabaseProvider>
        </SolidPodProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
