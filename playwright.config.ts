import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const CSS_PORT = 4001
export const CSS_ISSUER = `http://localhost:${CSS_PORT}`

/**
 * One dedicated pod account per suite that writes.
 *
 * Suites run in parallel, and a pod is shared mutable state: two suites writing
 * to `testuser` at once produce failures that look like sync bugs and are not.
 * Read-only suites may share `testuser`; anything that writes gets its own,
 * created in `e2e/global-setup.ts`.
 *
 * | Suite | Pod user      | Why                                    |
 * |-------|---------------|----------------------------------------|
 * | a, d  | (none)        | signed out — no pod at all             |
 * | b     | `buser`       | writes happies                         |
 * | e     | `testuser`    | signs in and out; writes nothing       |
 * | f     | `fuser`       | writes, reads back, checks pod bytes   |
 * | g     | `guser`       | goes offline mid-session               |
 * | h     | `huser`       | seeded pod, then two-way sync          |
 * | i     | `liveuser`    | live poll: one app write, one peer's   |
 */
export const TEST_EMAIL = 'test@example.com'
export const TEST_PASSWORD = 'test1234'
export const TEST_POD_NAME = 'testuser'

export const BUSER_EMAIL = 'buser@example.com'
export const BUSER_PASSWORD = 'test1234'
export const BUSER_POD_NAME = 'buser'

export const FUSER_EMAIL = 'fuser@example.com'
export const FUSER_PASSWORD = 'test1234'
export const FUSER_POD_NAME = 'fuser'

export const GUSER_EMAIL = 'guser@example.com'
export const GUSER_PASSWORD = 'test1234'
export const GUSER_POD_NAME = 'guser'

export const HUSER_EMAIL = 'huser@example.com'
export const HUSER_PASSWORD = 'test1234'
export const HUSER_POD_NAME = 'huser'

export const LIVEUSER_EMAIL = 'liveuser@example.com'
export const LIVEUSER_PASSWORD = 'test1234'
export const LIVEUSER_POD_NAME = 'liveuser'

export const CSS_PID_FILE = path.join(__dirname, '.e2e-css-pid')
export const APP_URL = 'http://localhost:4173'

// Use the locally pre-installed Chromium when there is one (this dev
// environment ships it); in CI Playwright downloads its own.
const localChromium = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const executablePath = existsSync(localChromium) ? localChromium : undefined

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 120_000,
  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: APP_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
