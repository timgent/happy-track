import * as Sentry from '@sentry/capacitor'

export function reportError(error: unknown, context?: string): string {
    console.error(context ?? 'Unhandled error', error)
    Sentry.captureException(toReportableError(error))
    return formatErrorDetails(error, context)
}

/**
 * Sentry can only build a useful event out of an `Error`. Anything else is
 * titled by its own keys — a thrown `{ name, message }` object arrives as
 * "Object captured as exception with keys: message, name", with no message and
 * only Sentry's own minified frames for a stack, which says nothing about where
 * it came from.
 *
 * So wrap non-Errors in a real Error that keeps the original message and name,
 * and hang the original value off `cause` so any extra properties survive.
 */
function toReportableError(error: unknown): Error {
    if (error instanceof Error) return error

    const wrapped = new Error(messageFor(error)) as Error & { cause?: unknown }
    wrapped.cause = error
    if (typeof error === 'object' && error !== null) {
        const { name } = error as { name?: unknown }
        if (typeof name === 'string' && name) wrapped.name = name
    }
    return wrapped
}

function messageFor(error: unknown): string {
    if (typeof error === 'object' && error !== null) {
        const { message } = error as { message?: unknown }
        if (typeof message === 'string' && message) return message
        try {
            return JSON.stringify(error)
        } catch {
            return String(error)
        }
    }
    return String(error)
}

function formatErrorDetails(error: unknown, context?: string): string {
    const reportable = toReportableError(error)
    const heading = `${reportable.name}: ${reportable.message}`
    const lines = [`Time: ${new Date().toISOString()}`]
    if (context) lines.push(context)
    // The stack usually already opens with "<name>: <message>", but a wrapped
    // non-Error's stack was captured before its name was restored, so the
    // heading is added separately when it isn't there.
    lines.push(reportable.stack?.startsWith(heading) ? reportable.stack : [heading, reportable.stack].filter(Boolean).join('\n'))
    return lines.join('\n')
}
