import { test, expect } from '../fixtures'
import { composerBox, happyCards, writeHappy } from '../helpers/happies'

/**
 * Suite D: getting around, and the settings that change what you see.
 *
 * Signed out throughout — none of this needs a pod, and running it without one
 * keeps it fast and keeps it honest about what the app does for someone who has
 * not signed in.
 */
test.describe('Getting around', () => {
    test('the three everyday destinations are one tap from anywhere', async ({ freshPage: page }) => {
        await page.goto('/#/today')
        // Scoped to the bar: pages also link to each other in their own prose.
        const nav = page.getByTestId('nav-bar')

        await nav.getByRole('link', { name: 'Journal' }).click()
        await expect(page).toHaveURL(/#\/journal/)

        await nav.getByRole('link', { name: 'Insights' }).click()
        await expect(page).toHaveURL(/#\/insights/)

        await nav.getByRole('link', { name: 'Today' }).click()
        await expect(page).toHaveURL(/#\/today/)
    })

    test('the current page is marked as such, not just styled', async ({ freshPage: page }) => {
        await page.goto('/#/journal')
        const nav = page.getByTestId('nav-bar')

        await expect(nav.getByRole('link', { name: 'Journal' })).toHaveAttribute('aria-current', 'page')
        await expect(nav.getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current', 'page')
    })

    test('a route that does not exist lands somewhere useful', async ({ freshPage: page }) => {
        await page.goto('/#/no-such-page')

        // The default redirect: the front door for someone signed out.
        await expect(page).toHaveURL(/#\/home/)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })

    test('the footer reaches the pages you need once', async ({ freshPage: page }) => {
        await page.goto('/#/today')

        await page.getByRole('link', { name: /^your data$/i }).click()
        await expect(page.getByRole('heading', { name: /^your data$/i })).toBeVisible()

        await page.getByRole('link', { name: /^settings$/i }).click()
        await expect(page.getByRole('heading', { name: /^settings$/i })).toBeVisible()
    })

    test('a journal month is a link someone can come back to', async ({ freshPage: page }) => {
        await page.goto('/#/journal/2026-03')

        await expect(page.getByRole('heading', { name: /march/i })).toBeVisible()
    })

    test('a nonsense month falls back to this one rather than an empty page', async ({ freshPage: page }) => {
        await page.goto('/#/journal/not-a-month')

        // A heading, not a blank — which is what rendering the bad key gave.
        await expect(page.getByRole('button', { name: /^show /i }).first()).toBeVisible()
    })
})

test.describe('Settings change what you see', () => {
    test('turning the mood picker off removes it from the box', async ({ freshPage: page }) => {
        await page.goto('/#/today')
        await expect(page.getByRole('radio', { name: 'Happy', exact: true })).toBeVisible()

        await page.goto('/#/settings')
        await page.getByText(/ask how it felt/i).click()

        await page.goto('/#/today')
        await expect(page.getByRole('radio', { name: 'Happy', exact: true })).toHaveCount(0)
    })

    test('turning prompts off removes the suggestion', async ({ freshPage: page }) => {
        await page.goto('/#/today')
        await expect(page.getByRole('button', { name: /another idea/i })).toBeVisible()

        await page.goto('/#/settings')
        await page.getByText(/suggest a prompt/i).click()

        await page.goto('/#/today')
        await expect(page.getByRole('button', { name: /another idea/i })).toHaveCount(0)
    })

    test('a setting survives a reload, because it is stored not just remembered', async ({ freshPage: page }) => {
        await page.goto('/#/settings')
        await page.getByText(/on this day/i).click()
        await expect(page.getByRole('checkbox', { name: /on this day/i })).not.toBeChecked()

        await page.reload()

        await expect(page.getByRole('checkbox', { name: /on this day/i })).not.toBeChecked()
    })

    test('the theme can be handed back to the operating system', async ({ freshPage: page }) => {
        await page.goto('/#/settings')

        await page.getByText('Dark', { exact: true }).click()
        await expect(page.locator('html')).toHaveClass(/dark/)

        await page.getByText('Light', { exact: true }).click()
        await expect(page.locator('html')).not.toHaveClass(/dark/)

        // The point of the three-way control: there is a way back to following
        // the OS, which a light/dark toggle alone does not give you.
        await page.getByText('System', { exact: true }).click()
        await expect(page.getByRole('radio', { name: 'System' })).toBeChecked()
    })
})

test.describe('A prompt is a suggestion, not a form', () => {
    test('another idea offers a different prompt', async ({ freshPage: page }) => {
        await page.goto('/#/today')

        const prompt = page.getByTestId('happy-composer').locator('.italic')
        const first = await prompt.textContent()

        await page.getByRole('button', { name: /another idea/i }).click()

        await expect(prompt).not.toHaveText(first!)
    })

    test('the prompt gets out of the way once you start typing', async ({ freshPage: page }) => {
        await page.goto('/#/today')
        await expect(page.getByRole('button', { name: /another idea/i })).toBeVisible()

        await composerBox(page).fill('I have my own idea, thanks')

        await expect(page.getByRole('button', { name: /another idea/i })).toHaveCount(0)
    })
})

test.describe('Insights', () => {
    test('holds back the claims it does not have the data for', async ({ freshPage: page }) => {
        await page.goto('/#/today')
        await writeHappy(page, 'Just the one happy')

        await page.goto('/#/insights')

        // A "your best day is Tuesday" drawn from one Tuesday is worse than
        // saying nothing, so the weekday chart waits for enough entries.
        await expect(page.getByRole('heading', { name: /days of the week/i })).toHaveCount(0)
        await expect(page.getByText(/a few more happies/i)).toBeVisible()
        // The honest figures are there from the first entry.
        await expect(page.getByText('Happies', { exact: true }).first()).toBeVisible()
    })

    test('every chart ships the numbers behind it', async ({ freshPage: page }) => {
        await page.goto('/#/today')
        await writeHappy(page, 'A happy with a mood', { mood: 'Delighted' })

        await page.goto('/#/insights')

        // The table is the accessible equivalent of the bars, and the fallback
        // for anyone the colour does not work for.
        const numbers = page.getByRole('group').filter({ hasText: /see the numbers/i }).first()
        await numbers.getByText(/see the numbers/i).click()
        await expect(numbers.getByRole('table')).toBeVisible()
    })

    test('a tag chip takes you to those happies in the journal', async ({ freshPage: page }) => {
        await page.goto('/#/today')
        await writeHappy(page, 'Tagged for the insights page', { tags: ['insightful'] })

        await page.goto('/#/insights')
        await page.getByRole('button', { name: /insightful/i }).click()

        await expect(page).toHaveURL(/#\/journal\?tag=insightful/)
        await expect(happyCards(page).filter({ hasText: 'Tagged for the insights page' })).toHaveCount(1)
    })
})
