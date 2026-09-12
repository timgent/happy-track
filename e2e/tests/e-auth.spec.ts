import { test, expect } from '../fixtures'
import { CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD } from '../../playwright.config'
import { accountMenu, loginToCss, logoutViaAccountMenu, waitForLiveSession } from '../helpers/login'
import { happyCards, writeHappy } from '../helpers/happies'

/**
 * Suite E: signing in, signing out, and what happens to the data on the way.
 *
 * Uses the shared `testuser` pod and is careful not to leave anything in it, so
 * the read-only suites can share it.
 */
test.describe('Signing in', () => {
    test('the sign-in dialog leads with the benefit, not the mechanism', async ({ freshPage: page }) => {
        await page.goto('/')

        await page.getByRole('button', { name: /^(sync my happies|sync)$/i }).first().click()

        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText(/sync your happies/i)).toBeVisible()
        await expect(dialog.getByText(/never holds a copy/i)).toBeVisible()
        // The explanation of what a Pod even is stays collapsed behind a
        // disclosure: useful, and not what somebody needs to read first.
        await expect(dialog.locator('details')).toBeVisible()
    })

    test('a full OIDC round trip signs you in and lands you on Today', async ({ freshPage: page }) => {
        await page.goto('/')

        await loginToCss(page, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)
        await waitForLiveSession(page)

        await expect(page).toHaveURL(/#\/today/)
        await expect(accountMenu(page).first()).toBeVisible()
        await expect(page.getByTestId('nav-offline-badge')).toHaveCount(0)
    })

    test('signing in from a page you were on brings you back to it', async ({ freshPage: page }) => {
        // Sign-in returns you to where you started, which is the point of it —
        // a neutral entry point is the only case that gets substituted.
        await page.goto('/#/insights')

        await loginToCss(page, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)

        await expect(page).toHaveURL(/#\/insights/)
    })

    test('the account menu names who you are signed in as', async ({ authedPage: page }) => {
        await accountMenu(page).first().click()

        // The WebID, so "which account is this?" is answerable — a nav bar that
        // only says "signed in" cannot answer it.
        await expect(page.getByText(/localhost:4001\/testuser/)).toBeVisible()
    })
})

test.describe('Signing out', () => {
    test('leaves the app usable, on the device, with no data from the pod', async ({ authedPage: page }) => {
        await logoutViaAccountMenu(page)

        // Back to being an anonymous visitor: the sign-in button returns.
        await expect(page.getByRole('button', { name: /^(sync my happies|sync)$/i }).first()).toBeVisible()
        await expect(accountMenu(page)).toHaveCount(0)

        // And the app still works — signed out is a supported state, not an error.
        await page.goto('/#/today')
        await writeHappy(page, 'Written after signing out')
        await expect(happyCards(page).filter({ hasText: 'Written after signing out' })).toHaveCount(1)
    })

    test('does not leave the previous identity\'s happies on screen', async ({ authedPage: page }) => {
        // One database per identity. Without that, signing out on a shared
        // laptop would leave the last person's journal visible — and the next
        // sign-in would upload it to the wrong pod.
        await page.goto('/#/today')
        await writeHappy(page, 'Written while signed in to testuser')

        await logoutViaAccountMenu(page)
        await page.goto('/#/journal')

        await expect(happyCards(page).filter({ hasText: 'Written while signed in to testuser' }))
            .toHaveCount(0)
    })
})

test.describe('Being signed in changes what the app says about storage', () => {
    test('your data page names the pod when there is one, and says so when there is not', async ({ freshPage: page }) => {
        await page.goto('/#/your-data')
        await expect(page.getByText(/not yet\. sign in/i)).toBeVisible()
        // The claim that matters, in both states.
        await expect(page.getByText(/there is no happy track server/i)).toBeVisible()

        await page.goto('/')
        await loginToCss(page, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)
        await waitForLiveSession(page)
        await page.goto('/#/your-data')

        await expect(page.getByText(/testuser/).first()).toBeVisible()
        await expect(page.getByRole('button', { name: /delete everywhere/i })).toBeVisible()
    })

    test('settings says where the preferences are kept', async ({ freshPage: page }) => {
        await page.goto('/#/settings')
        await expect(page.getByText(/saved on this device\. sign in/i)).toBeVisible()

        await page.goto('/')
        await loginToCss(page, CSS_ISSUER, TEST_EMAIL, TEST_PASSWORD)
        await waitForLiveSession(page)
        await page.goto('/#/settings')

        await expect(page.getByText(/saved to your pod/i)).toBeVisible()
    })
})
