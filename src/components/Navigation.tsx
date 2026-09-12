import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { useSolidPod } from './SolidPodContext'
import { SolidProviderSelector } from './SolidProviderSelector'
import { AccountMenu, ProfileBadge } from './AccountMenu'
import { profileDisplayName, useSolidProfile } from '../hooks/useSolidProfile'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

/** The three places the app actually goes. */
const LINKS = [
    { to: '/today', label: 'Today' },
    { to: '/journal', label: 'Journal' },
    { to: '/insights', label: 'Insights' },
] as const

/**
 * The one thing the nav owes a signed-in user whose pod is unreachable: which
 * of the two states they are in. Their name is on screen either way, so without
 * this the only difference between "synced" and "not syncing" would be
 * invisible.
 */
const OfflineBadge = () => (
    <span
        data-testid="nav-offline-badge"
        className="whitespace-nowrap rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold"
        title="You're still signed in. Your Pod is out of reach, so changes will sync when the connection is back."
    >
        Offline
    </span>
)

export const Navigation = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)
    const { login, logout, isLoggedIn, isReconnecting, webId, session } = useSolidPod()
    const location = useLocation()

    const profile = useSolidProfile(webId, session)
    const displayName = profileDisplayName(profile, webId)

    // The panel covers the page, so the page behind it must not scroll under it.
    useBodyScrollLock(isMenuOpen)

    // Signed in is signed in, whether or not the pod can be reached right now.
    // Offering "Sync" to someone whose session is merely offline is what makes a
    // lost connection read as a sign-out; the badge says which of the two it is.
    const showsAsSignedIn = isLoggedIn || isReconnecting

    const isCurrent = (to: string) =>
        location.pathname === to || location.pathname.startsWith(`${to}/`)

    return (
        <>
            <nav className="safe-area-top bg-accent-950 text-white shadow-soft">
                <div className="mx-auto max-w-5xl px-4">
                    <div data-testid="nav-bar" className="flex h-14 items-center justify-between md:h-16">
                        <div className="flex min-w-0 items-center">
                            <Link
                                to="/today"
                                className="flex shrink-0 items-center gap-2 text-xl font-bold drop-shadow-md transition-transform duration-200 hover:scale-105 md:text-2xl"
                            >
                                <img src="/favicon.svg" alt="" className="h-7 w-7 md:h-8 md:w-8" />
                                Happy Track
                            </Link>
                            <div className="hidden md:block">
                                <div className="ml-8 flex items-baseline gap-1">
                                    {LINKS.map(link => (
                                        <Link
                                            key={link.to}
                                            to={link.to}
                                            aria-current={isCurrent(link.to) ? 'page' : undefined}
                                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 hover:scale-105 hover:bg-white/20 ${
                                                isCurrent(link.to) ? 'bg-white/15' : ''
                                            }`}
                                        >
                                            {link.label}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div data-testid="nav-bar-desktop" className="hidden items-center gap-3 md:flex">
                            {showsAsSignedIn ? (
                                <>
                                    {isReconnecting && <OfflineBadge />}
                                    <AccountMenu
                                        webId={webId ?? ''}
                                        displayName={displayName}
                                        photoUrl={profile.photo}
                                        onLogout={() => { void logout() }}
                                    />
                                </>
                            ) : (
                                <div className="flex flex-col items-end">
                                    <button
                                        onClick={() => setIsProviderSelectorOpen(true)}
                                        className="rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-accent-800 shadow-soft transition-all duration-200 hover:scale-105 hover:bg-white"
                                        title="Sign in to keep your happies in your own Solid Pod, on every device"
                                    >
                                        Sync my happies
                                    </button>
                                    <span className="mt-1 text-xs font-medium text-white">Keeps them on every device</span>
                                </div>
                            )}
                        </div>

                        <div data-testid="nav-bar-mobile" className="flex items-center gap-1 md:hidden">
                            {showsAsSignedIn ? (
                                <button
                                    type="button"
                                    onClick={() => setIsMenuOpen(true)}
                                    className="flex items-center rounded-lg p-1.5 transition-all duration-200 hover:bg-white/20"
                                >
                                    <span className="sr-only">Your profile, {displayName}</span>
                                    <ProfileBadge name={displayName} photoUrl={profile.photo} showName={false} />
                                </button>
                            ) : (
                                <button
                                    onClick={() => setIsProviderSelectorOpen(true)}
                                    className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-accent-800 shadow-soft transition-all duration-200 hover:bg-white"
                                    title="Sign in to keep your happies in your own Solid Pod, on every device"
                                >
                                    Sync
                                </button>
                            )}
                            <button
                                onClick={() => setIsMenuOpen(open => !open)}
                                aria-expanded={isMenuOpen}
                                aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                                className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-white/20"
                            >
                                {isMenuOpen
                                    ? <XMarkIcon aria-hidden="true" className="h-6 w-6" />
                                    : <Bars3Icon aria-hidden="true" className="h-6 w-6" />}
                            </button>
                        </div>
                    </div>
                </div>

                {isMenuOpen && (
                    <div data-testid="nav-mobile-menu" className="border-t border-white/15 px-4 pb-4 md:hidden">
                        <div className="flex flex-col gap-1 pt-2">
                            {LINKS.map(link => (
                                <Link
                                    key={link.to}
                                    to={link.to}
                                    onClick={() => setIsMenuOpen(false)}
                                    aria-current={isCurrent(link.to) ? 'page' : undefined}
                                    className={`min-h-11 rounded-xl px-4 py-2.5 font-semibold transition-colors hover:bg-white/20 ${
                                        isCurrent(link.to) ? 'bg-white/15' : ''
                                    }`}
                                >
                                    {link.label}
                                </Link>
                            ))}
                            <Link
                                to="/settings"
                                onClick={() => setIsMenuOpen(false)}
                                className="min-h-11 rounded-xl px-4 py-2.5 font-semibold transition-colors hover:bg-white/20"
                            >
                                Settings
                            </Link>
                            <Link
                                to="/your-data"
                                onClick={() => setIsMenuOpen(false)}
                                className="min-h-11 rounded-xl px-4 py-2.5 font-semibold transition-colors hover:bg-white/20"
                            >
                                Your data
                            </Link>
                            {showsAsSignedIn && (
                                <button
                                    type="button"
                                    onClick={() => { setIsMenuOpen(false); void logout() }}
                                    className="min-h-11 rounded-xl px-4 py-2.5 text-left font-semibold transition-colors hover:bg-white/20"
                                >
                                    Sign out
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </nav>

            <SolidProviderSelector
                isOpen={isProviderSelectorOpen}
                onClose={() => setIsProviderSelectorOpen(false)}
                onSelect={issuer => login(issuer)}
            />
        </>
    )
}
