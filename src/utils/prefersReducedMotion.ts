/**
 * Whether the user has asked for reduced motion. Anything that reveals content
 * over time (rather than just decorating it) should check this and jump
 * straight to the end state — the CSS guard in index.css only neutralises
 * animation/transition durations.
 */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
