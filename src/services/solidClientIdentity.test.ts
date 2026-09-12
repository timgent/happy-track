import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    HOSTED_CLIENT_ID_URL,
    NATIVE_REDIRECT_URI,
    solidClientDetails,
} from './solidClientIdentity'

/**
 * Which client the app presents itself as decides how long a session survives.
 *
 * A hosted Client ID Document is a permanent identity: the provider re-reads it
 * on every grant, and the registration cannot go stale. A dynamic registration
 * is a throwaway one, created at login and kept only for as long as the provider
 * feels like keeping it — when it is reaped, the next refresh comes back
 * `invalid_client`, which is terminal, and the user is signed out with a
 * perfectly good refresh token on disk.
 *
 * The native shell is served from `https://localhost`, so it used to fall
 * through to dynamic registration on every install. These pin it to the hosted
 * document instead.
 */

describe('solidClientDetails', () => {
    it('uses the hosted Client ID Document in the native app', () => {
        expect(solidClientDetails({ isNativePlatform: true, origin: 'https://localhost' }))
            .toEqual({ client_id: HOSTED_CLIENT_ID_URL })
    })

    it('uses the configured Client ID Document on the deployed site', () => {
        expect(solidClientDetails({
            clientIdUrl: 'https://happytrack.example.com/client-id.json',
            isNativePlatform: false,
            origin: 'https://happytrack.example.com',
        })).toEqual({ client_id: 'https://happytrack.example.com/client-id.json' })
    })

    it('lets a configured document override the hosted one, so a preview build can be tested natively', () => {
        expect(solidClientDetails({
            clientIdUrl: 'https://preview.example.com/client-id.json',
            isNativePlatform: true,
            origin: 'https://localhost',
        })).toEqual({ client_id: 'https://preview.example.com/client-id.json' })
    })

    it('registers dynamically on a web origin with no hosted document, such as a preview deploy', () => {
        expect(solidClientDetails({ isNativePlatform: false, origin: 'https://preview.example.com' }))
            .toEqual({ redirect_uris: ['https://preview.example.com/'], client_name: 'Happy Track' })
    })
})

describe('the hosted Client ID Document', () => {
    const document = JSON.parse(
        readFileSync(resolve(import.meta.dirname, '../../public/client-id.json'), 'utf-8'),
    ) as { client_id: string; redirect_uris: string[] }

    it('is the document the native app claims to be', () => {
        expect(document.client_id).toBe(HOSTED_CLIENT_ID_URL)
    })

    it('lists the redirect URI the native shell sends', () => {
        // The provider rejects the whole login when the redirect URI it receives
        // is not in this list, and the native shell can only ever send its own
        // loopback origin. Drop this entry and the mobile app cannot log in at all.
        expect(document.redirect_uris).toContain(NATIVE_REDIRECT_URI)
    })
})
