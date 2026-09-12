import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const init = vi.fn()
const mockIsNativePlatform = vi.fn(() => false)
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => mockIsNativePlatform() },
}))
vi.mock('@sentry/capacitor', () => ({ init: (...args: unknown[]) => init(...args) }))
vi.mock('@sentry/react', () => ({
    init: vi.fn(),
    feedbackIntegration: () => ({ name: 'Feedback' }),
    browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
}))

import type { ErrorEvent, StackFrame } from '@sentry/react'

import { initSentry, isThirdPartyScriptError } from './sentry'

function errorEvent(...frameSets: (StackFrame[] | undefined)[]): ErrorEvent {
    return {
        type: undefined,
        exception: {
            values: frameSets.map(frames => ({
                type: 'Error',
                value: 'boom',
                stacktrace: frames && { frames },
            })),
        },
    }
}

// Sentry stores frames oldest-first, so the frame that actually threw is last.
const ourFrame: StackFrame = { function: 'r', filename: 'app:///assets/index-DhPzMc-b.js', lineno: 535 }
const injectedFrame: StackFrame = { function: 'scanForForms', filename: 'app:///<anonymous>', lineno: 65 }

describe('isThirdPartyScriptError', () => {
    it('drops an error thrown by an injected script through our wrapped setTimeout', () => {
        // The reported issue: a WebView form scanner we don't ship calls a native
        // JavaScript interface we don't register, and fails.
        expect(isThirdPartyScriptError(errorEvent([ourFrame, injectedFrame]))).toBe(true)
    })

    it.each(['<anonymous>', '<unknown>', 'app:///<unknown>', '', undefined])(
        'treats a throwing frame with filename %p as third-party',
        filename => {
            expect(isThirdPartyScriptError(errorEvent([ourFrame, { function: 'scanForForms', filename }]))).toBe(true)
        },
    )

    it('keeps an error thrown from our own bundle', () => {
        expect(isThirdPartyScriptError(errorEvent([injectedFrame, ourFrame]))).toBe(false)
    })

    it('keeps an error whose whole stack is ours', () => {
        expect(isThirdPartyScriptError(errorEvent([ourFrame, { ...ourFrame, function: 'savePackingList' }]))).toBe(false)
    })

    it('keeps a chained exception when any link was thrown by our code', () => {
        expect(isThirdPartyScriptError(errorEvent([ourFrame], [ourFrame, injectedFrame]))).toBe(false)
    })

    it.each([
        ['no stacktrace', errorEvent(undefined)],
        ['an empty stack', errorEvent([])],
        ['no exception at all', { type: undefined } as ErrorEvent],
        ['no exception values', { type: undefined, exception: {} } as ErrorEvent],
    ])('keeps an event with %s rather than guessing', (_label, event) => {
        expect(isThirdPartyScriptError(event)).toBe(false)
    })
})

describe('initSentry', () => {
    let originalLocation: Location

    beforeEach(() => {
        init.mockClear()
        mockIsNativePlatform.mockReturnValue(false)
        originalLocation = window.location
        servedFrom('packmeup.app')
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    })

    function servedFrom(hostname: string) {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, hostname },
        })
    }

    it('does not initialise Sentry in local dev', () => {
        vi.stubEnv('MODE', 'development')

        initSentry()

        expect(init).not.toHaveBeenCalled()
    })

    it('does not initialise Sentry under test', () => {
        vi.stubEnv('MODE', 'test')

        initSentry()

        expect(init).not.toHaveBeenCalled()
    })

    it('initialises Sentry in production builds', () => {
        vi.stubEnv('MODE', 'production')

        initSentry()

        expect(init).toHaveBeenCalledOnce()
        expect(init.mock.calls[0][0]).toMatchObject({ environment: 'production' })
    })

    it('initialises Sentry in local dev when explicitly opted in', () => {
        vi.stubEnv('MODE', 'development')
        vi.stubEnv('VITE_SENTRY_ENABLED', 'true')

        initSentry()

        expect(init).toHaveBeenCalledOnce()
    })

    it.each(['localhost', '127.0.0.1', '[::1]'])(
        'does not initialise Sentry for a production build served from %s',
        hostname => {
            // `npm run test:e2e` builds in production mode and serves the result with
            // `vite preview`, so the E2E suite used to report its own failures — a stream
            // of "Failed to fetch" from the test Solid server on localhost:4001 — into the
            // production project, on every run and every PR in CI.
            vi.stubEnv('MODE', 'production')
            servedFrom(hostname)

            initSentry()

            expect(init).not.toHaveBeenCalled()
        },
    )

    it('initialises Sentry in the native app, which also serves the bundle from localhost', () => {
        vi.stubEnv('MODE', 'production')
        mockIsNativePlatform.mockReturnValue(true)
        servedFrom('localhost')

        initSentry()

        expect(init).toHaveBeenCalledOnce()
    })

    it('initialises Sentry on a local web server when explicitly opted in', () => {
        vi.stubEnv('MODE', 'production')
        vi.stubEnv('VITE_SENTRY_ENABLED', 'true')
        servedFrom('localhost')

        initSentry()

        expect(init).toHaveBeenCalledOnce()
    })

    it('filters third-party script errors out of what it sends', () => {
        vi.stubEnv('MODE', 'production')

        initSentry()

        const { beforeSend } = init.mock.calls[0][0] as {
            beforeSend: (event: ErrorEvent) => ErrorEvent | null
        }
        const injected = errorEvent([ourFrame, injectedFrame])
        const ours = errorEvent([ourFrame, { ...ourFrame, function: 'savePackingList' }])

        expect(beforeSend(injected)).toBeNull()
        expect(beforeSend(ours)).toBe(ours)
    })
})
