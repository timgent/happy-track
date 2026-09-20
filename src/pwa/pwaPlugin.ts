import { VitePWA } from 'vite-plugin-pwa'
import { manifest } from './manifest'

/**
 * Shared between vite.config.ts and vitest.config.ts. Vitest needs the plugin
 * too, not to run workbox, but because `virtual:pwa-register/react` (used by
 * UpdateAvailableBanner) is a module this plugin provides — without it here,
 * resolving that import fails before vi.mock ever gets a chance to replace it.
 */
export function pwaPlugin() {
    return VitePWA({
        // The router is a HashRouter (see main.tsx), so the server ever sees
        // one path — "/" — and the app shell precached below is the whole
        // app. Registration is manual (UpdateAvailableBanner.tsx) so it can
        // be skipped on the Capacitor native shells, which already serve
        // their bundle from the device and have no use for a second,
        // browser-shaped cache layered on top of it.
        injectRegister: false,
        registerType: 'prompt',
        manifest,
        workbox: {
            // Everything the app needs to cold-start offline; data itself
            // (PouchDB, the Solid pod) is never in here — see CLAUDE.md's
            // Offline section for why reads and writes go local-first
            // through useHappies/useSyncCoordinator instead.
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        },
    })
}
