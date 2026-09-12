import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * The signed-in user, drawn the way a signed-in state should be: their face and
 * their name. A WebID in the nav bar is developer output — true, unreadable,
 * and no help at all in telling you *which* account you are in.
 *
 * Degrades in two steps, because both cases are real: a profile card with a
 * photo gets the photo, one without gets a generic icon, and a card with no
 * name at all leaves the caller to fall back to the pod username (see
 * `podUsernameFromWebId`). The photo can also fail *after* it loads clean —
 * a 404 on a URL the card still names — so `onError` drops back to the icon
 * rather than leaving a broken image where a face should be.
 */
export function ProfileBadge({ name, photoUrl, showName = true }: { name: string; photoUrl?: string | null; showName?: boolean }) {
    // Keyed to the URL, so a person whose photo 404s falls back but still picks
    // up a *later* working one. Same reasoning as PersonAvatar.
    const [failed, setFailed] = useState<string | null>(null)
    const showPhoto = !!photoUrl && failed !== photoUrl

    return (
        <>
            {showPhoto ? (
                <img
                    data-testid="profile-photo"
                    src={photoUrl}
                    alt=""
                    aria-hidden="true"
                    onError={() => setFailed(photoUrl)}
                    className="w-7 h-7 rounded-full object-cover shrink-0 ring-2 ring-white/40"
                />
            ) : (
                <svg
                    data-testid="profile-icon"
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-7 h-7 rounded-full shrink-0 bg-white/20 p-1"
                >
                    <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
                </svg>
            )}
            {/* The mobile bar has room for a face and not for a name; the
                control that holds it carries the name for a screen reader. */}
            {showName && <span className="text-sm font-medium truncate max-w-[10rem]">{name}</span>}
        </>
    )
}

/**
 * Everything about *your account* rather than about your happies: which account
 * you are in, its WebID, your backups, and the way out.
 *
 * A disclosure, not an ARIA `menu`. A `role="menu"` promises arrow-key roving
 * focus and a typeahead; this is three controls reached by Tab, which is what a
 * dropdown of links actually is. Escape closes it and hands focus back to the
 * trigger, so the keyboard never ends up stranded on a panel that has gone.
 *
 * The trigger's accessible name is "Account menu <name>": the hidden half says
 * what the control does, the visible half stays inside the accessible name, so
 * "click the button that says Alice" and "press the Account menu button" are
 * the same instruction (WCAG 2.5.3).
 */
export function AccountMenu({ webId, displayName, photoUrl, onLogout }: {
    webId: string
    displayName: string
    photoUrl?: string | null
    onLogout: () => void
}) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (!isOpen) return
        const onPointerDown = (e: PointerEvent | MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [isOpen])

    const closeAndRefocus = () => {
        setIsOpen(false)
        triggerRef.current?.focus()
    }

    return (
        <div
            ref={containerRef}
            className="relative"
            // On the container rather than the panel: Escape has to work while
            // focus is still on the trigger, which is where it is the moment
            // the panel opens.
            onKeyDown={e => { if (e.key === 'Escape' && isOpen) closeAndRefocus() }}
        >
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsOpen(open => !open)}
                aria-expanded={isOpen}
                className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-xl hover:bg-white/20 transition-all duration-200"
            >
                <span className="sr-only">Account menu</span>
                <ProfileBadge name={displayName} photoUrl={photoUrl} />
                <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-72 z-50 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-soft ring-1 ring-black/10 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Signed in as</p>
                        {/* Reachable, but no longer the thing the nav bar shouts */}
                        <p className="mt-1 text-xs text-gray-700 dark:text-gray-300 break-all" title={webId}>{webId}</p>
                    </div>
                    <Link
                        to="/backups"
                        onClick={() => setIsOpen(false)}
                        className="block px-4 py-3 text-sm font-semibold hover:bg-primary-50 dark:hover:bg-primary-950/40 transition-colors duration-200"
                    >
                        Backups
                    </Link>
                    {/*
                      * The theme choice moved off the nav bar to /settings (#337).
                      * This menu is the nearest thing the app has to a settings
                      * home, so it points at the page rather than holding the
                      * control — the same page a signed-out user reaches from the
                      * footer.
                      */}
                    <Link
                        to="/settings"
                        onClick={() => setIsOpen(false)}
                        className="block px-4 py-3 text-sm font-semibold border-t border-gray-100 dark:border-gray-800 hover:bg-primary-50 dark:hover:bg-primary-950/40 transition-colors duration-200"
                    >
                        Settings
                    </Link>
                    <button
                        type="button"
                        onClick={() => { setIsOpen(false); onLogout() }}
                        className="w-full text-left px-4 py-3 text-sm font-semibold border-t border-gray-100 dark:border-gray-800 hover:bg-primary-50 dark:hover:bg-primary-950/40 transition-colors duration-200"
                    >
                        Logout
                    </button>
                </div>
            )}
        </div>
    )
}
