import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'
import { CSS_ISSUER, BUSER_EMAIL, BUSER_PASSWORD } from '../../playwright.config'
import { loginToCss, waitForLiveSession } from '../helpers/login'
import { composerBox, happyAction, happyCards, writeHappy } from '../helpers/happies'

/**
 * Suite B: the full write / edit / delete cycle, signed in.
 *
 * Runs against its own pod (`buser`) because it writes: a suite that writes to
 * a pod another suite reads produces failures that look like sync bugs.
 *
 * Serial, because each test builds on the state the last one left — which is
 * also the honest shape of this feature: a journal is cumulative.
 */
test.describe.configure({ mode: 'serial' })

/**
 * One sign-in for the whole file.
 *
 * A full OIDC round trip against CSS takes the better part of a minute, and
 * signing in again per test spent more time in the consent screen than in the
 * app. Sharing the page is also closer to how the thing is used: one session,
 * several actions.
 */
let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await page.goto('/')
    await loginToCss(page, CSS_ISSUER, BUSER_EMAIL, BUSER_PASSWORD)
    await waitForLiveSession(page)
})

test.afterAll(async () => {
    await page?.close()
})

/** Back to Today, ready for the next test. */
async function openToday() {
    await page.goto('/#/today')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

async function openJournal(path = '/#/journal') {
    await page.goto(path)
}

test.describe('Writing, signed in', () => {
    test('a happy with a mood and tags round-trips through the pod', async () => {
        await openToday()

        await writeHappy(page, 'Cycled to work without getting rained on', {
            mood: 'Really happy',
            tags: ['bike', 'weather'],
        })

        const card = happyCards(page).first()
        await expect(card).toContainText('Cycled to work without getting rained on')
        await expect(card.getByRole('img', { name: 'Really happy' })).toBeVisible()
        await expect(card.getByRole('button', { name: 'bike' })).toBeVisible()
        await expect(card.getByRole('button', { name: 'weather' })).toBeVisible()

        // The real proof: a reload reads it back from the device, and the pod
        // copy is asserted by suite F against the bytes on the server.
        await page.reload()
        await expect(happyCards(page).first()).toContainText('Cycled to work')
    })

    test('an edit changes the words and keeps the rest', async () => {
        await openToday()

        const card = happyCards(page).first()
        await happyAction(page, card, 'Edit')

        await composerBox(page).fill('Cycled to work in the sunshine')
        await page.getByRole('button', { name: /save changes/i }).click()

        await expect(happyCards(page).first()).toContainText('Cycled to work in the sunshine')
        await expect(happyCards(page).first().getByRole('button', { name: 'bike' })).toBeVisible()
    })

    test('a delete can be taken back from the toast', async () => {
        await openToday()

        await writeHappy(page, 'Temporary happy that will be restored')
        const countBefore = await happyCards(page).count()

        const card = happyCards(page).filter({ hasText: 'Temporary happy' })
        await happyAction(page, card, 'Delete')
        await page.getByRole('button', { name: /^delete$/i }).click()

        await expect(happyCards(page).filter({ hasText: 'Temporary happy' })).toHaveCount(0)

        // The undo has to still be there to take — the toast holds it for
        // long enough to be read and acted on.
        await page.getByRole('button', { name: /undo/i }).click()

        await expect(happyCards(page)).toHaveCount(countBefore)
        await expect(happyCards(page).filter({ hasText: 'Temporary happy' })).toHaveCount(1)
    })

    test('a delete that is not undone stays deleted across a reload', async () => {
        await openToday()

        const card = happyCards(page).filter({ hasText: 'Temporary happy' })
        await happyAction(page, card, 'Delete')
        await page.getByRole('button', { name: /^delete$/i }).click()
        await expect(happyCards(page).filter({ hasText: 'Temporary happy' })).toHaveCount(0)

        // This is the tombstone earning its keep: without one, the sync on
        // reload sees an id the pod does not have and puts it back.
        await page.reload()
        await waitForLiveSession(page)

        await expect(happyCards(page).filter({ hasText: 'Temporary happy' })).toHaveCount(0)
    })

    test('cancelling a delete keeps the happy', async () => {
        await openToday()

        const before = await happyCards(page).count()
        await happyAction(page, happyCards(page).first(), 'Delete')
        await page.getByRole('button', { name: /keep it/i }).click()

        await expect(happyCards(page)).toHaveCount(before)
    })
})

test.describe('The journal, signed in', () => {
    test('finds a happy by its words, across the whole journal', async () => {
        await openJournal('/#/journal')

        await page.getByRole('searchbox', { name: /search your happies/i }).fill('sunshine')

        await expect(happyCards(page)).toHaveCount(1)
        await expect(happyCards(page).first()).toContainText('sunshine')
        await expect(page.getByText(/across your whole journal/i)).toBeVisible()
    })

    test('filters by a tag, and clears back to browsing by month', async () => {
        await openJournal('/#/journal')

        await page.getByTestId('tag-filters').getByRole('button', { name: /^bike,/ }).click()
        await expect(page.getByText(/tagged/i)).toBeVisible()

        await page.getByRole('button', { name: /^clear$/i }).click()

        // The month navigator is back, which is what "not searching" looks like.
        await expect(page.getByRole('button', { name: /^show /i }).first()).toBeVisible()
    })

    test('says so plainly when nothing matches', async () => {
        await openJournal('/#/journal')

        await page.getByRole('searchbox', { name: /search your happies/i }).fill('zzzznothinglikethis')

        await expect(page.getByText(/nothing matched/i).first()).toBeVisible()
    })

    test('a month with nothing in it says which month, not just "empty"', async () => {
        // A month a long way back, which certainly has nothing in it.
        await openJournal('/#/journal/2020-03')

        await expect(page.getByText(/nothing written in march/i)).toBeVisible()
    })
})

/**
 * Editing on a phone, where the old layout failed hardest.
 *
 * The editor used to render at the top of the journal, above every day group,
 * wherever the card being edited happened to be — so on a page as long as the
 * user's history it opened off-screen. And because the composer deliberately
 * declines to autofocus on a phone, nothing scrolled to it either: tapping Edit
 * looked like tapping a dead button.
 *
 * Last in the file, and on its own viewport, because it writes several happies
 * and the tests above count what is on the page.
 */
test.describe('Editing on a small screen', () => {
    test.beforeAll(async () => {
        await page.setViewportSize({ width: 390, height: 500 })
    })

    test.afterAll(async () => {
        await page.setViewportSize({ width: 1280, height: 720 })
    })

    test('opens the editor where the card is, in view and ready to type', async () => {
        await openToday()

        // Enough to push the last card below the fold on a phone.
        for (const text of ['Long enough journal one', 'Long enough journal two', 'Long enough journal three']) {
            await writeHappy(page, text)
        }

        await openJournal('/#/journal')
        const card = happyCards(page).last()
        await expect(card).toBeVisible()
        await happyAction(page, card, 'Edit')

        const composer = page.getByTestId('happy-composer')
        await expect(composer).toBeInViewport()
        await expect(composerBox(page)).toBeFocused()
    })
})
