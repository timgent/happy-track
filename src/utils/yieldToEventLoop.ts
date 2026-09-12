/**
 * Hands the main thread back to the browser, so it can paint a frame and
 * respond to input before the caller carries on.
 *
 * A `setTimeout` rather than a microtask or `queueMicrotask`: microtasks drain
 * inside the task that queued them, which is exactly the situation this exists
 * to break up. `scheduler.yield()` would be the modern spelling, but it is not
 * everywhere yet and a timer is the one mechanism that reliably lets rendering
 * happen in every browser the app runs in. Nested timers are clamped to ~4ms,
 * so a loop that yields between items pays a few milliseconds per item — noise
 * against the work being broken up (see docs/login-performance.md).
 */
export function yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
}
