import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'
import {
    CSS_PORT, CSS_ISSUER,
    FUSER_EMAIL, FUSER_PASSWORD, FUSER_POD_NAME,
} from '../../playwright.config'
import { loginToCss, waitForLiveSession } from '../helpers/login'
import { happyCards, writeHappy } from '../helpers/happies'
import {
    createCssClientCredentials,
    getCssBearerToken,
    listPodMonths,
    loginToExistingCssAccount,
    readPodMonthTurtle,
    seedPodWithMonth,
} from '../helpers/pod-seed'

/**
 * Suite F: does the pod actually end up holding it?
 *
 * The suite that matters most, and the one every other test in this repo takes
 * on trust. Everything else asserts what the *app* shows; this reads the bytes
 * off the Solid server with its own credentials and checks them, in both
 * directions:
 *
 * - write in the app → the Turtle on the server says so
 * - write on the server → the app picks it up
 *
 * Server-side reads go through a client-credentials Bearer token rather than
 * the browser session, so what is being asserted is the state of the pod and
 * not the state of the app's cache.
 */
test.describe.configure({ mode: 'serial' })

const podUrl = `http://localhost:${CSS_PORT}/${FUSER_POD_NAME}/`
const webId = `http://localhost:${CSS_PORT}/${FUSER_POD_NAME}/profile/card#me`

let page: Page
let bearerToken: string

/** This month, as the app computes it — local time, not UTC. */
function thisMonth(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

test.beforeAll(async ({ browser }) => {
    const accountToken = await loginToExistingCssAccount(CSS_PORT, FUSER_EMAIL, FUSER_PASSWORD)
    const { id, secret } = await createCssClientCredentials(CSS_PORT, accountToken, webId)
    bearerToken = await getCssBearerToken(CSS_PORT, id, secret, webId)

    page = await browser.newPage()
    if (process.env.E2E_DEBUG) {
        page.on('console', m => console.log('[browser]', m.text()))
        page.on('pageerror', e => console.log('[pageerror]', e.message))
    }
    await page.goto('/')
    await loginToCss(page, CSS_ISSUER, FUSER_EMAIL, FUSER_PASSWORD)
    await waitForLiveSession(page)
})

test.afterAll(async () => {
    await page?.close()
})

test.describe('App → Pod', () => {
    test('a happy written in the app lands on the pod as Turtle', async () => {
        await page.goto('/#/today')

        await writeHappy(page, 'Read a whole chapter without falling asleep', {
            mood: 'Happy',
            tags: ['reading'],
        })

        // The push happens after the paint and is not something the UI waits
        // on, so poll the server rather than assume it has landed.
        await expect.poll(
            () => readPodMonthTurtle(podUrl, bearerToken, thisMonth()),
            { timeout: 20_000, message: 'the month document should appear on the pod' },
        ).toContain('Read a whole chapter without falling asleep')

        const turtle = (await readPodMonthTurtle(podUrl, bearerToken, thisMonth()))!

        // The vocabulary another Solid app would read it by.
        expect(turtle).toContain('https://happy-track.app/vocab#Happy')
        expect(turtle).toContain('https://happy-track.app/vocab#happyDate')
        // The text uses schema:text, a standard term rather than one of ours.
        expect(turtle).toMatch(/schema:text|<https:\/\/schema\.org\/text>/)
        // The mood is the number, not the emoji — the faces are presentation.
        expect(turtle).toContain('https://happy-track.app/vocab#mood')
        expect(turtle).toContain('"reading"')
    })

    test('the month document is named after the month, in the months container', async () => {
        await expect.poll(
            () => listPodMonths(podUrl, bearerToken),
            { timeout: 20_000 },
        ).toContain(thisMonth())
    })

    test('an edit in the app replaces the words on the pod', async () => {
        await page.goto('/#/today')

        const card = happyCards(page).filter({ hasText: 'Read a whole chapter' })
        await card.getByRole('button', { name: /actions for this happy/i }).click()
        await page.getByRole('menuitem', { name: 'Edit' }).click()

        await page.getByTestId('happy-composer').getByRole('textbox').first()
            .fill('Read two whole chapters')
        await page.getByRole('button', { name: /save changes/i }).click()
        await expect(happyCards(page).filter({ hasText: 'Read two whole chapters' })).toHaveCount(1)

        await expect.poll(
            () => readPodMonthTurtle(podUrl, bearerToken, thisMonth()),
            { timeout: 20_000 },
        ).toContain('Read two whole chapters')

        const turtle = (await readPodMonthTurtle(podUrl, bearerToken, thisMonth()))!
        expect(turtle).not.toContain('Read a whole chapter without falling asleep')
    })

    test('a delete in the app leaves a tombstone on the pod, not just an absence', async () => {
        await page.goto('/#/today')

        const card = happyCards(page).filter({ hasText: 'Read two whole chapters' })
        await card.getByRole('button', { name: /actions for this happy/i }).click()
        await page.getByRole('menuitem', { name: 'Delete' }).click()
        await page.getByRole('button', { name: /^delete$/i }).click()
        await expect(happyCards(page).filter({ hasText: 'Read two whole chapters' })).toHaveCount(0)

        // The tombstone is what stops another device that still holds the copy
        // from reading its absence as "never uploaded" and putting it back.
        await expect.poll(
            () => readPodMonthTurtle(podUrl, bearerToken, thisMonth()),
            { timeout: 20_000 },
        ).toContain('https://happy-track.app/vocab#HappyDeletion')

        const turtle = (await readPodMonthTurtle(podUrl, bearerToken, thisMonth()))!
        expect(turtle).not.toContain('Read two whole chapters')
    })
})

test.describe('Pod → App', () => {
    test('a happy written straight to the pod shows up in the app', async () => {
        // Standing in for another device. Written with the app's own serializer
        // (see seedPodWithMonth), so this is the real format and not a fixture
        // that could drift from it.
        const month = thisMonth()
        const existing = (await readPodMonthTurtle(podUrl, bearerToken, month)) ?? ''
        expect(existing).not.toContain('Written from another device entirely')

        await seedPodWithMonth(podUrl, bearerToken, {
            month,
            happies: [{
                id: 'from-elsewhere',
                date: `${month}-01`,
                text: 'Written from another device entirely',
                createdAt: `${month}-01T09:00:00.000Z`,
                // Deliberately far in the future relative to anything this
                // browser has written, so the merge cannot prefer the local
                // copy for timing reasons and mask a real failure.
                lastModified: '2030-01-01T00:00:00.000Z',
            }],
            deletions: [],
            // A real client always stamps the document as well as the entries
            // (see saveWithSyncPrevention), so the seed does too.
            lastModified: '2030-01-01T00:00:00.000Z',
        })

        // A reload rather than waiting out the poll: this is the sign-in sync,
        // which is the path a second device actually takes.
        await page.goto('/#/journal')
        await page.reload()
        await waitForLiveSession(page)

        await expect(happyCards(page).filter({ hasText: 'Written from another device entirely' }))
            .toHaveCount(1, { timeout: 30_000 })
    })

    test('neither side wins: a local happy and a pod happy both survive', async () => {
        // The whole reason the month is merged rather than replaced.
        const month = thisMonth()

        await page.goto('/#/today')
        await writeHappy(page, 'Written here, in this browser')
        await expect.poll(
            () => readPodMonthTurtle(podUrl, bearerToken, month),
            { timeout: 20_000 },
        ).toContain('Written here, in this browser')

        await page.goto('/#/journal')
        await expect(happyCards(page).filter({ hasText: 'Written here, in this browser' })).toHaveCount(1)
        await expect(happyCards(page).filter({ hasText: 'Written from another device entirely' })).toHaveCount(1)

        // And the pod holds both, not just the app's view of them.
        const turtle = (await readPodMonthTurtle(podUrl, bearerToken, month))!
        expect(turtle).toContain('Written here, in this browser')
        expect(turtle).toContain('Written from another device entirely')
    })
})
