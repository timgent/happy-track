import { defineConfig } from 'vitest/config'
import { pwaPlugin } from './src/pwa/pwaPlugin'

export default defineConfig({
  // Needed only so 'virtual:pwa-register/react' resolves for
  // UpdateAvailableBanner.test.tsx — see src/pwa/pwaPlugin.ts.
  plugins: [pwaPlugin()],
  test: {
    environment: 'happy-dom',
    globals: true,
    exclude: ['node_modules', 'dist', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.{js,ts}',
        '**/*.test.{js,ts,jsx,tsx}',
      ],
    },
  },
})
