import { test as base, type BrowserContext, type Page } from '@playwright/test'
import { CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD } from '../playwright.config'
import { loginToCss, waitForLiveSession } from './helpers/login'

type Fixtures = {
    /** A page with a fresh, empty browser context — no session, no local data. */
    freshPage: Page
    /** A fresh context that has been through a real sign-in. */
    authedContext: BrowserContext
    /** A page with a live session on the shared read-only test pod. */
    authedPage: Page
}

export const test = base.extend<Fixtures>({
    freshPage: async ({ browser }, use) => {
        const context = await browser.newContext()
        const page = await context.newPage()
        await use(page)
        await context.close()
    },

    authedContext: async ({ browser }, use) => {
        // A fresh sign-in every time rather than a saved storageState: CSS v7's
        // silent-auth (`prompt=none`) redirect gets stuck, so a stored session
        // cannot be restored into a new context reliably.
        const context = await browser.newContext()
        const page = await context.newPage()
        await page.goto('/')
        await loginToCss(page, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)
        await page.close()
        await use(context)
        await context.close()
    },

    authedPage: async ({ authedContext }, use) => {
        const page = await authedContext.newPage()
        await page.goto('/')
        // A *live* session, not just the account menu — see waitForLiveSession.
        await waitForLiveSession(page)
        await use(page)
    },
})

export { expect } from '@playwright/test'
