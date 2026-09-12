/**
 * Opt-in timing instrumentation for the slow paths (saving a list to the pod,
 * polling it back, deleting an item).
 *
 * Off unless someone turns it on, so the cost in normal use is one boolean
 * check per call. Turn it on from the console — or from a Playwright harness —
 * with:
 *
 *   localStorage.setItem('happyTrack.profiling', '1')  // then reload
 *
 * Completed measurements are pushed to `window.__happyTrackProfile__` and logged
 * to the console, so a profiling run can be read either by eye or by a script.
 */

const STORAGE_KEY = 'happyTrack.profiling'
const WINDOW_KEY = '__happyTrackProfile__'

export interface ProfileEntry {
    label: string
    /** performance.now() at the start of the measured work */
    startMs: number
    durationMs: number
    detail?: Record<string, unknown>
}

interface ProfileWindow {
    [WINDOW_KEY]?: ProfileEntry[]
}

let enabled: boolean | null = null

function readEnabled(): boolean {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
        // Private mode / SSR — treat as off
        return false
    }
}

/** Cached so the hot paths don't hit localStorage on every measurement. */
export function isProfilingEnabled(): boolean {
    if (enabled === null) enabled = readEnabled()
    return enabled
}

/** Test seam: forget the cached flag so the next check re-reads localStorage. */
export function resetProfilingCache(): void {
    enabled = null
}

function buffer(): ProfileEntry[] {
    const w = globalThis as ProfileWindow
    if (!w[WINDOW_KEY]) w[WINDOW_KEY] = []
    return w[WINDOW_KEY]!
}

function record(entry: ProfileEntry): void {
    buffer().push(entry)
    console.log(
        `[profile] ${entry.label} ${entry.durationMs.toFixed(1)}ms`,
        entry.detail ?? ''
    )
}

export function getProfileEntries(): ProfileEntry[] {
    return isProfilingEnabled() ? [...buffer()] : []
}

export function clearProfileEntries(): void {
    buffer().length = 0
}

/**
 * Time `fn`. Returns whatever `fn` returns, so a call can be wrapped in place:
 * `await profile('save', () => save(data))`.
 *
 * An async `fn` is timed to its settled promise; a throwing `fn` is still
 * recorded (labelled as failed) before the error propagates.
 */
export function profile<T>(
    label: string,
    fn: () => T,
    detail?: Record<string, unknown>
): T {
    if (!isProfilingEnabled()) return fn()

    const startMs = performance.now()
    const finish = (extra?: Record<string, unknown>) => {
        record({
            label,
            startMs,
            durationMs: performance.now() - startMs,
            detail: extra ? { ...detail, ...extra } : detail,
        })
    }

    let result: T
    try {
        result = fn()
    } catch (err) {
        finish({ failed: true })
        throw err
    }

    if (result instanceof Promise) {
        return result.then(
            value => { finish(); return value },
            err => { finish({ failed: true }); throw err }
        ) as T
    }

    finish()
    return result
}

/** Record a zero-duration event — useful for marking when a poll fired. */
export function profileEvent(label: string, detail?: Record<string, unknown>): void {
    if (!isProfilingEnabled()) return
    record({ label, startMs: performance.now(), durationMs: 0, detail })
}
