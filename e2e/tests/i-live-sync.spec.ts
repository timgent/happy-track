import { test, expect } from '../fixtures'
import {
    CSS_PORT, CSS_ISSUER,
    LIVEUSER_EMAIL, LIVEUSER_PASSWORD, LIVEUSER_POD_NAME,
} from '../../playwright.config'
import { loginToCss, waitForLiveSession } from '../helpers/login'
import { happyCards, writeHappy } from '../helpers/happies'
import {
    createCssClientCredentials,
    getCssBearerToken,
    loginToExistingCssAccount,
    readPodMonthTurtle,
    seedPodWithMonth,
} from '../helpers/pod-seed'

/**
 * Suite I: a change made elsewhere arrives while the app is open.
 *
 * The two-devices-at-once case, and the one that most needs a pod of its own.
 * It is a deliberate three-way interleaving — the app writes, a peer writes,
 * the app polls — so any leftover state or in-flight push-back from another
 * suite would show up here as a phantom failure. `liveuser` is touched by
 * nothing else.
 */
test.describe.configure({ mode: 'serial' })

const podUrl = `http://localhost:${CSS_PORT}/${LIVEUSER_POD_NAME}/`
const webId = `${podUrl}profile/card#me`

/** This month, as the app computes it — local time, not UTC. */
function thisMonth(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

test('a happy written on the pod arrives without a reload, and is not overwritten', async ({ browser }) => {
    const accountToken = await loginToExistingCssAccount(CSS_PORT, LIVEUSER_EMAIL, LIVEUSER_PASSWORD)
    const { id, secret } = await createCssClientCredentials(CSS_PORT, accountToken, webId)
    const bearerToken = await getCssBearerToken(CSS_PORT, id, secret, webId)

    const page = await browser.newPage()
    if (process.env.E2E_DEBUG) {
        page.on('console', message => console.log('[browser]', message.text()))
    }

    try {
        await page.goto('/')
        await loginToCss(page, CSS_ISSUER, LIVEUSER_EMAIL, LIVEUSER_PASSWORD)
        await waitForLiveSession(page)

        const month = thisMonth()

        // ── 1. The app writes, and it reaches the pod ────────────────────────
        await page.goto('/#/today')
        await writeHappy(page, 'Written on this device')

        await expect.poll(
            () => readPodMonthTurtle(podUrl, bearerToken, month),
            { timeout: 20_000, message: 'the local happy should reach the pod' },
        ).toContain('Written on this device')

        const podCopy = (await readPodMonthTurtle(podUrl, bearerToken, month))!
        const localHappyId = /#happy-([0-9a-f-]+)>/.exec(podCopy)?.[1]
        expect(localHappyId, 'the pod copy should name the happy by its id').toBeTruthy()

        // ── 2. A peer writes to the same month ──────────────────────────────
        // Both entries, as a peer that had synced would hold them: dropping the
        // local one would be a peer *deleting* it, which is a different test.
        // The stamps are far in the future so the merge cannot prefer the local
        // copy on timing and mask a failure.
        await seedPodWithMonth(podUrl, bearerToken, {
            month,
            happies: [
                {
                    id: localHappyId!,
                    date: `${month}-01`,
                    text: 'Written on this device',
                    createdAt: `${month}-01T08:00:00.000Z`,
                    lastModified: '2030-01-01T00:00:00.000Z',
                },
                {
                    id: 'from-a-peer',
                    date: `${month}-01`,
                    text: 'Written on another device',
                    createdAt: `${month}-01T09:00:00.000Z`,
                    lastModified: '2030-01-01T00:00:00.000Z',
                },
            ],
            deletions: [],
            lastModified: '2030-01-01T00:00:00.000Z',
        })

        // ── 3. The app notices, with no reload ──────────────────────────────
        // The 10-second poll on the month being looked at is what makes two
        // devices open at once feel like one app.
        await page.goto('/#/journal')
        await expect(happyCards(page).filter({ hasText: 'Written on another device' }))
            .toHaveCount(1, { timeout: 60_000 })

        // ── 4. Neither write was lost ───────────────────────────────────────
        await expect(happyCards(page).filter({ hasText: 'Written on this device' })).toHaveCount(1)

        // And on the pod, not just in the app's view of it. This is what the
        // conditional merge push-back buys: without it, the app's own merge
        // could land on top of the peer's write and lose it for good — an
        // external Solid app has no local copy to heal from.
        await expect.poll(
            () => readPodMonthTurtle(podUrl, bearerToken, month),
            { timeout: 30_000 },
        ).toContain('Written on another device')

        const merged = (await readPodMonthTurtle(podUrl, bearerToken, month))!
        expect(merged).toContain('Written on this device')
    } finally {
        await page.close()
    }
})
