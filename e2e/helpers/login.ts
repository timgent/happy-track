import { expect, type Locator, type Page } from '@playwright/test'

/**
 * The signed-in sentinel. Once you are signed in the nav shows the account
 * menu; signed out it shows a "Sync" button instead.
 */
export function accountMenu(page: Page): Locator {
  return page.getByRole('button', { name: /account menu/i })
}

/**
 * The *live* signed-in sentinel: the account, with no offline notice beside it.
 *
 * The account menu on its own does not mean "the pod is reachable" — a session
 * that is stored but not yet live shows the same account with an "Offline"
 * badge, which is deliberate (offline must not look like signed out). So
 * anything that needs a working pod waits for this, or it races the restore.
 */
export async function waitForLiveSession(page: Page, timeout = 30_000): Promise<void> {
  await accountMenu(page).first().waitFor({ state: 'visible', timeout })
  await expect(page.getByTestId('offline-banner')).toHaveCount(0, { timeout })
}

/** Opens the account menu, so its links and Sign out button are reachable. */
export async function openAccountMenu(page: Page): Promise<void> {
  await accountMenu(page).first().click()
}

/** Signs out the way a user does: open the account menu, then Sign out. */
export async function logoutViaAccountMenu(page: Page): Promise<void> {
  await openAccountMenu(page)
  await page.getByRole('button', { name: /^(sign out|logout)$/i }).click()
}

/**
 * Drives the full Solid OIDC sign-in through the app's own UI.
 *
 * CSS v7's flow, which is what the waits below are shaped around:
 *  1. The app redirects to CSS `/.oidc/auth?…`
 *  2. CSS redirects through `/.account/` → `/.account/oidc/prompt/` →
 *     `/.account/login/` → `/.account/login/password/`
 *  3. The login form's submit button is disabled until CSS's own JS loads
 *  4. After logging in, CSS lands on its consent page
 *  5. The `#authorize` button is likewise disabled until it has loaded WebIDs
 *  6. Authorize → CSS redirects to the SPA root → the app handles the callback
 */
export async function loginToCss(
  page: Page,
  cssIssuer: string,
  email: string,
  password: string,
  options?: { waitForLoggedIn?: boolean },
): Promise<void> {
  // Either the desktop or the mobile button, whichever this viewport shows.
  await page.getByRole('button', { name: /^(sync my happies|sync)$/i }).first().click()
  await page.getByRole('dialog').waitFor()

  // The search box doubles as pod-URL entry: type the issuer, then take the
  // "connect to this URL" option it offers.
  await page.getByLabel(/search providers or paste your pod url/i).fill(cssIssuer)
  await page.getByRole('button', { name: `Connect to ${cssIssuer.replace(/\/$/, '')}` }).click()

  await page.waitForURL(
    url => url.hostname === 'localhost'
      && url.port === new URL(cssIssuer).port
      && url.pathname.includes('/login/password'),
    { timeout: 20_000 },
  )

  const loginBtn = page.locator('button[type="submit"][name="submit"]')
  await loginBtn.waitFor({ timeout: 10_000 })
  await page.waitForFunction(() => {
    const btn = document.querySelector('button[type="submit"][name="submit"]') as HTMLButtonElement | null
    return btn && !btn.disabled
  }, { timeout: 10_000 })

  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await loginBtn.click()

  await page.waitForURL(
    url => url.pathname.includes('/oidc/prompt') || url.pathname.includes('consent'),
    { timeout: 20_000 },
  )

  const authorizeBtn = page.locator('#authorize')
  await authorizeBtn.waitFor({ timeout: 10_000 })
  await page.waitForFunction(() => {
    const btn = document.querySelector('#authorize') as HTMLButtonElement | null
    return btn && !btn.disabled
  }, { timeout: 10_000 })
  await authorizeBtn.click()

  // CSS redirects back to the SPA root with the OAuth params; the app processes
  // the callback and navigates on.
  await page.waitForURL(/localhost:4173/, { timeout: 20_000 })
  if (options?.waitForLoggedIn !== false) {
    await accountMenu(page).first().waitFor({ timeout: 20_000 })
  }
}
