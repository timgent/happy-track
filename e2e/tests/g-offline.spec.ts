import { test, expect } from '../fixtures'
import {
    CSS_PORT, CSS_ISSUER,
    GUSER_EMAIL, GUSER_PASSWORD, GUSER_POD_NAME,
} from '../../playwright.config'
import { loginToCss, accountMenu } from '../helpers/login'
import { blockPod, goOffline, goOnline, happyCards, writeHappy } from '../helpers/happies'
import {
    createCssClientCredentials,
    getCssBearerToken,
    loginToExistingCssAccount,
    readPodMonthTurtle,
} from '../helpers/pod-seed'

/**
 * Suite G: with no connection at all.
 *
 * The claim being tested is the one on the front page — "works with no signal" —
 * and it has two halves that are easy to get wrong in opposite directions:
 *
 * 1. **Offline must keep working.** Writing, reading back, navigating: all of
 *    it comes off the device, so none of it may wait for, or be blocked by, a
 *    pod that cannot be reached.
 * 2. **Offline must not look like being signed out.** This is the failure that
 *    makes someone re-authenticate, or worse, assume their journal is gone. The
 *    account stays on screen, an "Offline" badge says which state it is, and a
 *    banner says what happens to the changes made meanwhile.
 *
 * Serial and on its own pod, because it cuts the network out from under a live
 * session.
 */
test.describe.configure({ mode: 'serial' })

const podUrl = `http://localhost:${CSS_PORT}/${GUSER_POD_NAME}/`
const webId = `${podUrl}profile/card#me`

function thisMonth(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

test('a session that cannot reach its pod is still a session', async ({ browser }) => {
    const accountToken = await loginToExistingCssAccount(CSS_PORT, GUSER_EMAIL, GUSER_PASSWORD)
    const { id, secret } = await createCssClientCredentials(CSS_PORT, accountToken, webId)
    const bearerToken = await getCssBearerToken(CSS_PORT, id, secret, webId)

    const page = await browser.newPage()

    try {
        await page.goto('/')
        await loginToCss(page, CSS_ISSUER, GUSER_EMAIL, GUSER_PASSWORD)
        await page.goto('/#/today')
        await writeHappy(page, 'Written while online')

        // ── Pull the plug ───────────────────────────────────────────────────
        await goOffline(page)

        // Still signed in, and saying so.
        await expect(accountMenu(page).first()).toBeVisible()
        await expect(page.getByRole('button', { name: /^(sync my happies|sync)$/i })).toHaveCount(0)

        // ── Writing still works, and is not a special case ──────────────────
        await writeHappy(page, 'Written with no connection at all')
        await expect(happyCards(page).filter({ hasText: 'Written with no connection at all' }))
            .toHaveCount(1)

        // Nothing failed in the user's face: the pod push is best-effort and
        // its failure is not their problem to solve.
        await expect(page.getByText(/could not save/i)).toHaveCount(0)

        // ── And the rest of the app is whole ────────────────────────────────
        await page.goto('/#/journal')
        await expect(happyCards(page).filter({ hasText: 'Written with no connection at all' }))
            .toHaveCount(1)
        await expect(happyCards(page).filter({ hasText: 'Written while online' })).toHaveCount(1)

        await page.goto('/#/insights')
        await expect(page.getByText('Happies', { exact: true }).first()).toBeVisible()

        // ── Back online: what was written offline reaches the pod ───────────
        await goOnline(page)
        await page.goto('/#/today')

        await expect.poll(
            () => readPodMonthTurtle(podUrl, bearerToken, thisMonth()),
            { timeout: 60_000, message: 'the offline happy should sync once the connection is back' },
        ).toContain('Written with no connection at all')
    } finally {
        await page.close()
    }
})

test('a cold start with no connection opens on the journal, signed in', async ({ browser }) => {
    // The failure this is really about: a device that has been offline since
    // before it was opened. The session cannot be made live (that needs the
    // provider), and if the app treated "not live" as "signed out" it would
    // open the marketing page and the empty local database — the user's
    // journal would look as though it had been deleted.
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
        await page.goto('/')
        await loginToCss(page, CSS_ISSUER, GUSER_EMAIL, GUSER_PASSWORD)
        await page.goto('/#/today')
        await writeHappy(page, 'Here before the connection went')

        // Make the pod unreachable, then start the app from scratch. See
        // `blockPod`: the app itself has to stay loadable, because a browser
        // with no network at all cannot fetch the bundle either.
        await blockPod(page, CSS_ISSUER)
        await page.goto('/')
        await page.reload()

        // Signed in, with the badge that says the pod is out of reach.
        await expect(accountMenu(page).first()).toBeVisible({ timeout: 30_000 })
        await expect(page.getByTestId('nav-offline-badge')).toBeVisible({ timeout: 30_000 })

        // Not the front door — Today, which is where a signed-in user belongs.
        await expect(page).toHaveURL(/#\/today/)

        // And the identity's own data, not the empty local database.
        await expect(happyCards(page).filter({ hasText: 'Here before the connection went' }))
            .toHaveCount(1, { timeout: 30_000 })

        // The banner explains itself rather than alarming anyone.
        const banner = page.getByTestId('offline-banner')
        await expect(banner).toBeVisible()
        await expect(banner).toContainText(/offline|reconnect/i)
        await expect(banner).toContainText(/stay editable|sync/i)

        // Writing still works on a session that has never been live this run.
        await writeHappy(page, 'Written on a cold offline start')
        await expect(happyCards(page).filter({ hasText: 'Written on a cold offline start' }))
            .toHaveCount(1)
    } finally {
        await context.close()
    }
})
