import { test, expect } from '../fixtures'
import {
    CSS_PORT, CSS_ISSUER,
    HUSER_EMAIL, HUSER_PASSWORD, HUSER_POD_NAME,
} from '../../playwright.config'
import { loginToCss, waitForLiveSession } from '../helpers/login'
import { happyCards } from '../helpers/happies'
import {
    createCssClientCredentials,
    getCssBearerToken,
    loginToExistingCssAccount,
    seedPodWithMonth,
} from '../helpers/pod-seed'
import type { Happy } from '../../src/happies/types'

/**
 * Suite H: a pod with a journal already in it.
 *
 * Everything that only shows up once there is history — streaks, "on this day",
 * the month navigator's range, the insights that wait for enough data — needs
 * months of entries, which is impractical to type in a test. So the pod is
 * seeded server-side with a plausible journal and the app is asked to read it.
 *
 * The dates are computed relative to today rather than hardcoded, so the suite
 * does not quietly start failing in November.
 */
test.describe.configure({ mode: 'serial' })

const podUrl = `http://localhost:${CSS_PORT}/${HUSER_POD_NAME}/`
const webId = `${podUrl}profile/card#me`

function dateKey(offsetDays: number): string {
    const date = new Date()
    date.setDate(date.getDate() + offsetDays)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function happy(id: string, date: string, text: string, extra: Partial<Happy> = {}): Happy {
    return {
        id,
        date,
        text,
        createdAt: `${date}T09:00:00.000Z`,
        lastModified: `${date}T09:00:00.000Z`,
        ...extra,
    }
}

test('a seeded journal reads back with its streak, tags and moods', async ({ browser }) => {
    const accountToken = await loginToExistingCssAccount(CSS_PORT, HUSER_EMAIL, HUSER_PASSWORD)
    const { id, secret } = await createCssClientCredentials(CSS_PORT, accountToken, webId)
    const bearerToken = await getCssBearerToken(CSS_PORT, id, secret, webId)

    // Five days running, ending today: enough for the 3-day milestone to be
    // behind us and for the streak to read as live.
    const run = [0, -1, -2, -3, -4].map(offset => dateKey(offset))
    // A happy from exactly a year ago, for "on this day".
    const lastYear = (() => {
        const date = new Date()
        date.setFullYear(date.getFullYear() - 1)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    })()

    // Group by month, because a month is the document.
    const byMonth = new Map<string, Happy[]>()
    const add = (entry: Happy) => {
        const key = entry.date.slice(0, 7)
        byMonth.set(key, [...(byMonth.get(key) ?? []), entry])
    }

    run.forEach((date, index) => add(happy(
        `run-${index}`,
        date,
        `Day ${index} of the run`,
        { mood: 3, tags: index % 2 === 0 ? ['routine'] : ['routine', 'weather'] },
    )))
    add(happy('a-year-ago', lastYear, 'This time last year, a very good sandwich', { mood: 4 }))

    for (const [month, happies] of byMonth) {
        await seedPodWithMonth(podUrl, bearerToken, {
            month,
            happies,
            deletions: [],
            lastModified: `${month}-01T09:00:00.000Z`,
        })
    }

    const page = await browser.newPage()
    try {
        await page.goto('/')
        await loginToCss(page, CSS_ISSUER, HUSER_EMAIL, HUSER_PASSWORD)
        await waitForLiveSession(page)
        await page.goto('/#/today')

        // ── The streak, counted from the seeded run ─────────────────────────
        await expect(page.getByTestId('streak-badge')).toContainText(/5 days in a row/, { timeout: 30_000 })

        // ── Today's entry is on Today ───────────────────────────────────────
        await expect(happyCards(page).filter({ hasText: 'Day 0 of the run' })).toHaveCount(1)

        // ── On this day, resurfaced without being asked ─────────────────────
        const onThisDay = page.getByTestId('on-this-day')
        await expect(onThisDay).toBeVisible()
        await expect(onThisDay).toContainText('a very good sandwich')
        await expect(onThisDay).toContainText(/a year ago today/i)

        // ── The journal has the range, and the tags to filter it by ─────────
        await page.goto('/#/journal')
        await expect(page.getByRole('heading', { name: /^today$/i })).toBeVisible()
        await expect(page.getByRole('heading', { name: /^yesterday$/i })).toBeVisible()

        await page.getByTestId('tag-filters').getByRole('button', { name: /^weather,/ }).click()
        await expect(happyCards(page)).toHaveCount(2)

        // ── And the insights now have enough behind them to say something ───
        await page.goto('/#/insights')
        await expect(page.getByText('Happies', { exact: true }).first()).toBeVisible()
        await expect(page.getByRole('heading', { name: /how it felt/i })).toBeVisible()
        await expect(page.getByRole('heading', { name: /your tags/i })).toBeVisible()
        // 6 seeded entries is below the threshold for a weekday claim.
        await expect(page.getByText(/a few more happies/i)).toBeVisible()
    } finally {
        await page.close()
    }
})
