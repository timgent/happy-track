import { spawn } from 'child_process'
import { existsSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createCssAccount } from './helpers/css-api'
import {
  CSS_PORT, CSS_ISSUER, CSS_PID_FILE, APP_URL,
  TEST_EMAIL, TEST_PASSWORD, TEST_POD_NAME,
  BUSER_EMAIL, BUSER_PASSWORD, BUSER_POD_NAME,
  FUSER_EMAIL, FUSER_PASSWORD, FUSER_POD_NAME,
  GUSER_EMAIL, GUSER_PASSWORD, GUSER_POD_NAME,
  HUSER_EMAIL, HUSER_PASSWORD, HUSER_POD_NAME,
  LIVEUSER_EMAIL, LIVEUSER_PASSWORD, LIVEUSER_POD_NAME,
} from '../playwright.config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The locally installed CSS binary (a devDependency), so CI does not spend a
// minute on an npx download before the first test runs.
const CSS_BIN = path.resolve(__dirname, '../node_modules/.bin/community-solid-server')

const ACCOUNTS = [
  { email: TEST_EMAIL, password: TEST_PASSWORD, pod: TEST_POD_NAME },
  { email: BUSER_EMAIL, password: BUSER_PASSWORD, pod: BUSER_POD_NAME },
  { email: FUSER_EMAIL, password: FUSER_PASSWORD, pod: FUSER_POD_NAME },
  { email: GUSER_EMAIL, password: GUSER_PASSWORD, pod: GUSER_POD_NAME },
  { email: HUSER_EMAIL, password: HUSER_PASSWORD, pod: HUSER_POD_NAME },
  { email: LIVEUSER_EMAIL, password: LIVEUSER_PASSWORD, pod: LIVEUSER_POD_NAME },
] as const

async function waitForUrl(url: string, maxWaitMs = 90_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.status < 500) return
    } catch { /* not ready yet */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`${url} did not become available within ${maxWaitMs}ms`)
}

/**
 * Starts a real Community Solid Server and creates one account per suite.
 *
 * A real server rather than a mock, because the things worth testing here are
 * exactly the ones a mock would get wrong: the OIDC round trip, DPoP-bound
 * tokens, conditional GETs and ETags, and CSS's own opinions about PUT and
 * container creation.
 */
export default async function globalSetup() {
  if (!existsSync(CSS_BIN)) {
    throw new Error(`Community Solid Server not installed at ${CSS_BIN} — run npm install`)
  }

  const cssProc = spawn(CSS_BIN, ['-p', String(CSS_PORT)], { stdio: 'pipe', detached: false })
  writeFileSync(CSS_PID_FILE, String(cssProc.pid))
  process.env.CSS_ISSUER = CSS_ISSUER

  console.log(`[setup] Starting CSS on port ${CSS_PORT} (pid ${cssProc.pid})…`)
  await waitForUrl(`http://localhost:${CSS_PORT}/.account/`)
  console.log('[setup] CSS ready')

  for (const account of ACCOUNTS) {
    await createCssAccount(CSS_PORT, account.email, account.password, account.pod)
    console.log(`[setup] Account created: ${account.email} (pod ${account.pod})`)
  }

  console.log('[setup] Waiting for the app…')
  await waitForUrl(APP_URL)
  console.log('[setup] App ready')
}
