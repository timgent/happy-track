import { useState } from 'react'
import { Button } from './Button'
import { getAuthLog, formatAuthLog, clearAuthLog, type AuthEvent } from '../services/authLog'

/**
 * Shows what has happened to the sign-in on this device.
 *
 * Being signed out unexpectedly is close to impossible to report usefully — by
 * the time you notice, the page has reloaded and the console is empty. This
 * keeps the record on the device, so "it signed me out again" can come with the
 * sequence that led to it, including what the pod provider actually said.
 */

const LEVEL_STYLES: Record<AuthEvent['level'], string> = {
    info: 'text-gray-600',
    warn: 'text-amber-700',
    error: 'text-danger-600 font-semibold',
}

function describe(entry: AuthEvent): string {
    const detail = entry.detail
        ? Object.entries(entry.detail)
              .map(([key, value]) => `${key}=${String(value)}`)
              .join(' ')
        : ''
    return detail ? `${entry.event} — ${detail}` : entry.event
}

export function SignInHistory() {
    const [expanded, setExpanded] = useState(false)
    const [copied, setCopied] = useState(false)
    const [version, setVersion] = useState(0)

    // Re-read on each render pass we ask for; the log is written outside React.
    // Most recent first, matching the copied bug report.
    const entries = [...getAuthLog()].reverse()
    void version

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(formatAuthLog())
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            setCopied(false)
        }
    }

    return (
        <section className="space-y-3">
            <h2 className="text-xl font-bold text-primary-900">Sign-in history</h2>
            <p className="text-gray-700">
                A record, kept on this device only, of every time the app signed in, renewed its
                access, or lost it. Nothing here is sent anywhere. If the app ever signs you out
                when it shouldn't, copying this and sending it to us shows exactly what happened.
            </p>

            <div className="flex flex-wrap gap-3">
                <Button variant="ghost" onClick={() => setExpanded(v => !v)}>
                    {expanded ? 'Hide history' : `Show history (${entries.length})`}
                </Button>
                <Button variant="ghost" onClick={copy} disabled={entries.length === 0}>
                    {copied ? 'Copied' : 'Copy for a bug report'}
                </Button>
                <Button
                    variant="ghost"
                    onClick={() => { clearAuthLog(); setVersion(v => v + 1) }}
                    disabled={entries.length === 0}
                >
                    Clear
                </Button>
            </div>

            {expanded && (
                entries.length === 0 ? (
                    <p className="text-sm text-gray-600">Nothing recorded yet.</p>
                ) : (
                    <ol className="max-h-80 overflow-y-auto rounded-xl bg-white/70 p-3 text-xs font-mono space-y-1">
                        {entries.map((entry, index) => (
                            <li key={`${entry.at}-${index}`} className={LEVEL_STYLES[entry.level]}>
                                <span className="text-gray-400">
                                    {new Date(entry.at).toLocaleString()}
                                </span>{' '}
                                <span className="break-all">{describe(entry)}</span>
                            </li>
                        ))}
                    </ol>
                )
            )}
        </section>
    )
}
