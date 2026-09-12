import { addBreadcrumb, captureMessage } from '@sentry/react'

/**
 * A durable record of everything that happens to the Solid session.
 *
 * Logouts are the hardest kind of bug to report: by the time the user notices,
 * the console is gone and the tab has reloaded. This keeps the last few hundred
 * auth events in localStorage — surviving reloads, restarts and crashes — so
 * "it logged me out again" can be answered with the actual sequence of events,
 * including what the identity provider said.
 */

const STORAGE_KEY = 'ht-auth-log'
const MAX_ENTRIES = 300

export type AuthEventLevel = 'info' | 'warn' | 'error'

export interface AuthEvent {
    /** Epoch millis. */
    at: number
    event: string
    level: AuthEventLevel
    detail?: Record<string, unknown>
}

let memoryLog: AuthEvent[] = []
let loaded = false

function load(): AuthEvent[] {
    if (loaded) return memoryLog
    loaded = true
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        memoryLog = raw ? (JSON.parse(raw) as AuthEvent[]) : []
    } catch {
        memoryLog = []
    }
    return memoryLog
}

function persist(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryLog))
    } catch {
        // Storage full or blocked (private mode). The in-memory log still works.
    }
}

/**
 * Records an auth event. Also drops a Sentry breadcrumb, so any error report
 * raised later carries the auth history that led up to it.
 */
export function logAuthEvent(
    event: string,
    detail?: Record<string, unknown>,
    level: AuthEventLevel = 'info',
): void {
    const entry: AuthEvent = { at: Date.now(), event, level, ...(detail ? { detail } : {}) }

    const log = load()
    log.push(entry)
    if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES)
    persist()

    try {
        // Sentry spells the middle level 'warning'.
        const sentryLevel = level === 'warn' ? 'warning' : level
        addBreadcrumb({ category: 'auth', message: event, level: sentryLevel, data: detail })
    } catch {
        // Sentry not initialised (tests, local dev) — the local log is what matters.
    }

    if (import.meta.env.DEV) {
        const line = `[auth] ${event}`
        if (level === 'error') console.error(line, detail ?? '')
        else if (level === 'warn') console.warn(line, detail ?? '')
        else console.log(line, detail ?? '')
    }
}

/**
 * Reports a session that genuinely ended, so it is visible without the device.
 *
 * The local log answers "why was I signed out?" only for someone holding the
 * phone. A session ending is not an error anything throws, so nothing reached
 * Sentry either, and the mobile app's expiries were invisible. This sends the
 * one fact that separates a dead grant from a stale client registration — the
 * reason — and nothing that identifies the user.
 */
export function reportSessionEnded(reason: string): void {
    try {
        captureMessage(`Solid session ended: ${reason}`, {
            level: 'error',
            tags: { auth_session_ended: reason },
        })
    } catch {
        // Sentry not initialised (tests, local dev) — the local log is what matters.
    }
}

/** The recorded events, oldest first. */
export function getAuthLog(): readonly AuthEvent[] {
    return load()
}

/** The log as pasteable text, for a bug report. Most recent event first. */
export function formatAuthLog(): string {
    return [...load()]
        .reverse()
        .map(e => {
            const detail = e.detail ? ` ${JSON.stringify(e.detail)}` : ''
            return `${new Date(e.at).toISOString()} [${e.level}] ${e.event}${detail}`
        })
        .join('\n')
}

export function clearAuthLog(): void {
    memoryLog = []
    loaded = true
    try {
        localStorage.removeItem(STORAGE_KEY)
    } catch {
        // Nothing we can do; the in-memory log is already cleared.
    }
}

/** Test seam — drops the cached copy so the next read comes from storage. */
export function resetAuthLogCacheForTests(): void {
    memoryLog = []
    loaded = false
}
