import { useEffect } from 'react'

/**
 * Stops the page behind an overlay from scrolling while it is open.
 *
 * Besides being correct overlay behaviour, it is what keeps the page — and on a
 * phone the browser's URL bar — from moving under a panel that covers it. A
 * moving URL bar resizes the viewport, which shifts everything the reader was
 * looking at.
 *
 * Takes a flag rather than locking on mount, so a component can keep the hook
 * at the top level (as the rules of hooks require) while the panel it belongs to
 * comes and goes.
 */
export function useBodyScrollLock(isLocked: boolean = true) {
    useEffect(() => {
        if (!isLocked) return

        const body = document.body
        const html = document.documentElement
        const previous = {
            body: body.style.overflow,
            html: html.style.overflow,
            overscroll: body.style.overscrollBehavior,
        }
        // Both: the scrolling element is <body> on some browsers and <html> on
        // others (notably mobile). Chaining is stopped too.
        body.style.overflow = 'hidden'
        html.style.overflow = 'hidden'
        body.style.overscrollBehavior = 'none'
        return () => {
            body.style.overflow = previous.body
            html.style.overflow = previous.html
            body.style.overscrollBehavior = previous.overscroll
        }
    }, [isLocked])
}
