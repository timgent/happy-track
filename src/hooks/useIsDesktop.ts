import { useSyncExternalStore } from 'react'

// Matches Tailwind's `sm:` breakpoint, so components can render either their
// mobile or desktop variant instead of putting both in the DOM and hiding one
// with CSS — with large item lists the doubled-up DOM is a real cost on phones.
const DESKTOP_QUERY = '(min-width: 640px)'

function subscribe(onChange: () => void) {
    const mql = window.matchMedia(DESKTOP_QUERY)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
    return window.matchMedia(DESKTOP_QUERY).matches
}

export function useIsDesktop(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
