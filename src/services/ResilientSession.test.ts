import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateKeyPair, exportJWK, SignJWT, calculateJwkThumbprint, createLocalJWKSet } from 'jose'
import { ResilientSession, SessionEndedError, type ResilientSessionOptions } from './ResilientSession'

/**
 * These cover the exchange that decides whether a user stays logged in.
 *
 * The case that matters most is the one the underlying library gets wrong: a
 * refresh that succeeds at the token endpoint but fails afterwards. The provider
 * has already retired the old refresh token by then, so if the replacement is not
 * banked immediately the session is unrecoverable — and presenting the spent one
 * next time gets the entire grant revoked as a suspected replay.
 */

const TOKEN_ENDPOINT = 'https://idp.example.org/token'
const JWKS_URI = 'https://idp.example.org/jwks'
const IDP = 'https://idp.example.org'
const CLIENT_ID = 'https://app.example.org/client-id.json'
const WEB_ID = 'https://user.example.org/profile/card#me'

/** An in-memory stand-in for SessionIDB. */
class FakeDb {
    items = new Map<string, unknown>()
    closed = 0
    async init() { return this }
    async setItem(id: string, value: unknown) { this.items.set(id, value) }
    async getItem(id: string) { return this.items.has(id) ? this.items.get(id) : null }
    async deleteItem(id: string) { this.items.delete(id) }
    async clear() { this.items.clear() }
    close() { this.closed++ }
}

let signingKeys: Awaited<ReturnType<typeof generateKeyPair>>
let dpopKeys: Awaited<ReturnType<typeof generateKeyPair>>
let localJwks: ReturnType<typeof createLocalJWKSet>

async function makeAccessToken(
    opts: { expiresIn?: string | number; signWith?: CryptoKey; omitWebId?: boolean } = {},
): Promise<string> {
    const jkt = await calculateJwkThumbprint(await exportJWK(dpopKeys.publicKey))
    return new SignJWT({
        ...(opts.omitWebId ? {} : { webid: WEB_ID }),
        client_id: CLIENT_ID,
        cnf: { jkt },
    })
        .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
        .setIssuer(IDP)
        .setAudience('solid')
        .setIssuedAt()
        .setExpirationTime(opts.expiresIn ?? '1h')
        .sign(opts.signWith ?? signingKeys.privateKey)
}

function makeSession(
    db: FakeDb,
    onExpiration?: () => void,
    overrides: Partial<ResilientSessionOptions> = {},
) {
    return new ResilientSession(
        { client_id: CLIENT_ID },
        db as unknown as ConstructorParameters<typeof ResilientSession>[1],
        {
            onSessionExpiration: onExpiration,
            // Verify against the local test key set rather than a remote JWKS.
            resolveJwks: () => localJwks,
            ...overrides,
        },
    )
}

function seed(db: FakeDb, refreshToken = 'refresh-token-v1') {
    db.items.set('client_id', CLIENT_ID)
    db.items.set('token_endpoint', TOKEN_ENDPOINT)
    db.items.set('dpop_keypair', dpopKeys)
    db.items.set('refresh_token', refreshToken)
    db.items.set('idp', IDP)
    db.items.set('jwks_uri', JWKS_URI)
}

describe('ResilientSession', () => {
    let db: FakeDb

    beforeEach(async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
        signingKeys = await generateKeyPair('ES256')
        dpopKeys = await generateKeyPair('ES256')
        const jwk = await exportJWK(signingKeys.publicKey)
        localJwks = createLocalJWKSet({ keys: [{ ...jwk, alg: 'ES256', kid: 'test-key', use: 'sig' }] })
        db = new FakeDb()
        seed(db)
        localStorage.clear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('banks the rotated refresh token even when the refresh fails afterwards', async () => {
        // The provider rotates and answers 200, then verification fails — exactly
        // the window where the old token is already spent. Whatever goes wrong
        // after the exchange, the replacement must not be lost with it.
        const strangerKeys = await generateKeyPair('ES256')
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input instanceof Request ? input.url : input)
            if (url.startsWith(TOKEN_ENDPOINT)) {
                return new Response(JSON.stringify({
                    access_token: await makeAccessToken({ signWith: strangerKeys.privateKey }),
                    refresh_token: 'refresh-token-v2',
                    expires_in: 3600,
                    token_type: 'DPoP',
                }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            throw new TypeError('Network request failed')
        }))

        const session = makeSession(db)
        await expect(session.restore()).rejects.toThrow()

        // The replacement must have survived the failure. Keeping the old value
        // here is what strands a session for good.
        expect(db.items.get('refresh_token')).toBe('refresh-token-v2')
        session.cancelRenewal()
    }, 30_000)

    it('restores the session and stores the rotated token on success', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input instanceof Request ? input.url : input)
            if (url.startsWith(TOKEN_ENDPOINT)) {
                return new Response(JSON.stringify({
                    access_token: await makeAccessToken(),
                    refresh_token: 'refresh-token-v2',
                    expires_in: 3600,
                    token_type: 'DPoP',
                }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            throw new Error(`unexpected request to ${url}`)
        }))

        const session = makeSession(db)
        await session.restore()

        expect(session.isActive).toBe(true)
        expect(session.webId).toBe(WEB_ID)
        expect(db.items.get('refresh_token')).toBe('refresh-token-v2')
        session.cancelRenewal()
    }, 30_000)

    it('ends the session only when the provider rejects the grant', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ error: 'invalid_grant', error_description: 'grant request is invalid' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        )))

        const onExpiration = vi.fn()
        const session = makeSession(db, onExpiration)

        await expect(session.restore()).rejects.toBeInstanceOf(SessionEndedError)
        expect(onExpiration).toHaveBeenCalledTimes(1)
    }, 30_000)

    it('retries a 503 rather than treating it as the end of the session', async () => {
        const fetchMock = vi.fn(async () => new Response('upstream unavailable', { status: 503 }))
        vi.stubGlobal('fetch', fetchMock)

        const onExpiration = vi.fn()
        const session = makeSession(db, onExpiration)

        await expect(session.restore()).rejects.not.toBeInstanceOf(SessionEndedError)
        expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
        // A struggling server is not a logged-out user.
        expect(onExpiration).not.toHaveBeenCalled()
        expect(db.items.get('refresh_token')).toBe('refresh-token-v1')
        session.cancelRenewal()
    }, 30_000)

    it('retries an unreachable token endpoint and keeps the refresh token', async () => {
        const fetchMock = vi.fn(async () => { throw new TypeError('Failed to fetch') })
        vi.stubGlobal('fetch', fetchMock)

        const onExpiration = vi.fn()
        const session = makeSession(db, onExpiration)

        await expect(session.restore()).rejects.not.toBeInstanceOf(SessionEndedError)
        expect(onExpiration).not.toHaveBeenCalled()
        expect(db.items.get('refresh_token')).toBe('refresh-token-v1')
        session.cancelRenewal()
    }, 30_000)

    it('recovers on a later attempt once the network comes back', async () => {
        // One blip, then the network is there. The retry inside a single restore()
        // should ride straight over it. Longer outages are the caller's backoff.
        let failuresLeft = 1
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input instanceof Request ? input.url : input)
            if (url.startsWith(TOKEN_ENDPOINT)) {
                if (failuresLeft-- > 0) throw new TypeError('Failed to fetch')
                return new Response(JSON.stringify({
                    access_token: await makeAccessToken(),
                    refresh_token: 'refresh-token-v2',
                    expires_in: 3600,
                    token_type: 'DPoP',
                }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            throw new Error(`unexpected request to ${url}`)
        }))

        const session = makeSession(db)
        await session.restore()

        expect(session.isActive).toBe(true)
        session.cancelRenewal()
    }, 30_000)

    it('reports no stored session when there is nothing to restore', async () => {
        const empty = new FakeDb()
        const session = makeSession(empty)
        expect(await session.hasStoredSession()).toBe(false)
        expect(await makeSession(db).hasStoredSession()).toBe(true)
    })

    it('wants renewal before the token has actually lapsed', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input instanceof Request ? input.url : input)
            if (url.startsWith(TOKEN_ENDPOINT)) {
                return new Response(JSON.stringify({
                    // 90s of life left: still valid, but inside the renewal buffer.
                    access_token: await makeAccessToken({ expiresIn: '90s' }),
                    refresh_token: 'refresh-token-v2',
                    expires_in: 90,
                    token_type: 'DPoP',
                }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            throw new Error(`unexpected request to ${url}`)
        }))

        const session = makeSession(db)
        await session.restore()

        expect(session.isActive).toBe(true)
        expect(session.getExpiresIn()).toBeGreaterThan(0)
        expect(session.needsRenewal()).toBe(true)
        session.cancelRenewal()
    }, 30_000)

    it('comes back on its own after a refresh that failed transiently', async () => {
        // A phone waking with the radio still down is the common case: the timer
        // that was due while it slept fires, the refresh fails, and nothing has
        // asked for a retry. Without one the token quietly lapses and the grant
        // is left to rot until the provider gives up on it.
        const fetchMock = vi.fn(async () => { throw new TypeError('Failed to fetch') })
        vi.stubGlobal('fetch', fetchMock)

        const session = makeSession(db, undefined, { transientRetryDelaysMs: [10] })
        await expect(session.restore()).rejects.not.toBeInstanceOf(SessionEndedError)

        const callsSoFar = fetchMock.mock.calls.length
        expect(callsSoFar).toBeGreaterThan(0)

        // Nothing else is watching. The session must come back by itself.
        await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsSoFar))
        session.cancelRenewal()
    }, 30_000)

    it('stops trying once the provider has rejected the grant', async () => {
        const fetchMock = vi.fn(async () => new Response(
            JSON.stringify({ error: 'invalid_grant' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        ))
        vi.stubGlobal('fetch', fetchMock)

        const session = makeSession(db, undefined, { transientRetryDelaysMs: [10] })
        await expect(session.restore()).rejects.toBeInstanceOf(SessionEndedError)

        const callsSoFar = fetchMock.mock.calls.length
        // A dead grant is not worth hammering the token endpoint over.
        await new Promise(resolve => setTimeout(resolve, 200))
        expect(fetchMock.mock.calls.length).toBe(callsSoFar)
    }, 30_000)

    it('never erases the stored session over a token it cannot make sense of', async () => {
        // SessionCore answers an access token with no `webid` claim by calling its
        // own logout(), which clears IndexedDB — the refresh token with it. The
        // provider is having a bad minute; that must not cost the session.
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input instanceof Request ? input.url : input)
            if (url.startsWith(TOKEN_ENDPOINT)) {
                return new Response(JSON.stringify({
                    access_token: await makeAccessToken({ omitWebId: true }),
                    refresh_token: 'refresh-token-v2',
                    expires_in: 3600,
                    token_type: 'DPoP',
                }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            throw new Error(`unexpected request to ${url}`)
        }))

        const onExpiration = vi.fn()
        const session = makeSession(db, onExpiration)

        await expect(session.restore()).rejects.not.toBeInstanceOf(SessionEndedError)

        expect(db.items.get('refresh_token')).toBe('refresh-token-v2')
        expect(db.items.size).toBeGreaterThan(1)
        expect(onExpiration).not.toHaveBeenCalled()
        session.cancelRenewal()
    }, 30_000)
})
