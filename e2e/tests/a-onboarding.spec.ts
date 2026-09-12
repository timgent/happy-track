import { test, expect } from '../fixtures'
import { composerBox, happyCards, writeHappy } from '../helpers/happies'

/**
 * Suite A: the first five minutes, signed out.
 *
 * Everything here runs with no pod and no account, because that is the claim
 * the landing page makes — "start writing, no account needed" — and it is the
 * one most worth holding to: an app that quietly needs a sign-in before it will
 * accept a sentence has no business promising otherwise.
 */
test.describe('Arriving for the first time', () => {
    test('the front door explains itself and needs no account', async ({ freshPage: page }) => {
        await page.goto('/')

        await expect(page.getByRole('heading', { level: 1 })).toContainText(/write down one happy thing/i)
        await expect(page.getByRole('link', { name: /start writing/i })).toBeVisible()
        await expect(page.getByText(/no account needed/i)).toBeVisible()
    })

    test('the first CTA goes straight to a box you can type in', async ({ freshPage: page }) => {
        await page.goto('/')
        await page.getByRole('link', { name: /start writing/i }).click()

        await expect(page).toHaveURL(/#\/today/)
        await expect(composerBox(page)).toBeVisible()
    })

    test('a happy can be written and read back with no sign-in at all', async ({ freshPage: page }) => {
        await page.goto('/#/today')

        await writeHappy(page, 'Found a fiver in an old coat')

        await expect(happyCards(page).first()).toContainText('Found a fiver in an old coat')
        // Not a sign-in prompt in sight on the critical path.
        await expect(page.getByRole('dialog')).toHaveCount(0)
    })

    test('what you wrote survives a reload, because it is on the device', async ({ freshPage: page }) => {
        await page.goto('/#/today')
        await writeHappy(page, 'The bus came straight away')

        await page.reload()

        await expect(happyCards(page).first()).toContainText('The bus came straight away')
    })

    test('the composer will not save an empty happy, and says why', async ({ freshPage: page }) => {
        await page.goto('/#/today')

        const save = page.getByRole('button', { name: /save this happy/i })
        await expect(save).toBeDisabled()
        await expect(page.getByText(/write a few words first/i)).toBeVisible()

        await composerBox(page).fill('Something')
        await expect(save).toBeEnabled()
    })

    test('whitespace alone is not a happy', async ({ freshPage: page }) => {
        await page.goto('/#/today')

        await composerBox(page).fill('     ')

        await expect(page.getByRole('button', { name: /save this happy/i })).toBeDisabled()
    })

    test('a second happy on the same day is offered, not fought', async ({ freshPage: page }) => {
        await page.goto('/#/today')
        await writeHappy(page, 'First good thing')

        // Once the day has something in it the box folds away — and says how to
        // get it back.
        await expect(page.getByRole('button', { name: /add another happy/i })).toBeVisible()

        await writeHappy(page, 'Second good thing')

        await expect(happyCards(page)).toHaveCount(2)
        await expect(page.getByText(/2 happies/i)).toBeVisible()
    })
})

test.describe('Signed out, the app is still whole', () => {
    test('the journal shows what was written and offers the way back to today', async ({ freshPage: page }) => {
        await page.goto('/#/today')
        await writeHappy(page, 'Sat in the sun for ten minutes')

        await page.getByRole('link', { name: /read back through your journal/i }).click()

        await expect(page).toHaveURL(/#\/journal/)
        await expect(happyCards(page).first()).toContainText('Sat in the sun')
        await expect(page.getByRole('heading', { name: /^today$/i })).toBeVisible()
    })

    test('insights says there is nothing to add up rather than showing zeros', async ({ freshPage: page }) => {
        await page.goto('/#/insights')

        await expect(page.getByText(/nothing to add up yet/i)).toBeVisible()
    })

    test('insights starts counting once there is something to count', async ({ freshPage: page }) => {
        await page.goto('/#/today')
        await writeHappy(page, 'A good cup of tea')

        await page.goto('/#/insights')

        await expect(page.getByText(/nothing to add up yet/i)).toHaveCount(0)
        await expect(page.getByText('Happies', { exact: true }).first()).toBeVisible()
    })

    test('the privacy policy is reachable and makes the no-server claim plainly', async ({ freshPage: page }) => {
        await page.goto('/')
        await page.getByRole('link', { name: /privacy policy/i }).click()

        await expect(page.getByRole('heading', { name: /privacy policy/i })).toBeVisible()
        await expect(page.getByText(/no server and no account system/i)).toBeVisible()
    })
})
