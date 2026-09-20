import type { ManifestOptions } from 'vite-plugin-pwa'

/**
 * The web app manifest, fed to vite-plugin-pwa (which writes it out as
 * manifest.webmanifest at build time) rather than hand-maintained as a static
 * JSON file in public/ — so the fields Android checks before offering the
 * install prompt are covered by manifest.test.ts the same way the rest of
 * this repo tests config-as-data.
 *
 * theme_color/background_color match the `<meta name="theme-color">` in
 * index.html (#2e1065) — the same deep plum in both themes, so the install
 * splash screen and the OS UI use one colour rather than a pair to keep in
 * step.
 */
export const manifest: Partial<ManifestOptions> = {
    name: 'Happy Track',
    short_name: 'Happy Track',
    description: 'Write down one happy thing each day. Your entries live in your own Solid Pod, and the app works offline.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#2e1065',
    theme_color: '#2e1065',
    icons: [
        {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
        },
        {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
        },
        {
            // Full-bleed artwork within Android's safe zone, distinct from
            // the two icons above — a maskable icon that also has purpose
            // "any" fails installability checks that require at least one
            // icon that is *not* maskable, since Android may otherwise crop
            // the only icon it has to work with.
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
        },
    ],
}
