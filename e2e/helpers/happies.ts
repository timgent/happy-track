import { expect, type Locator, type Page } from '@playwright/test'

/** The composer's textarea, whatever its heading currently says. */
export function composerBox(page: Page): Locator {
    return page.getByTestId('happy-composer').getByRole('textbox').first()
}

/** Every happy card on the page. */
export function happyCards(page: Page): Locator {
    return page.getByTestId('happy-card')
}

/**
 * Writes one happy and waits for it to appear as a card.
 *
 * Waiting for the card rather than for a network call is deliberate: the save
 * is local-first and the pod push happens after the paint, so the card
 * appearing *is* the save having completed as far as the user is concerned.
 * A test that waited on the request would be testing something the app
 * promises not to make you wait for.
 */
export async function writeHappy(
    page: Page,
    text: string,
    options: { mood?: string; tags?: string[] } = {},
): Promise<void> {
    // The composer folds away once the day has something in it, so wait for
    // whichever of the two the page is currently showing before touching
    // either. Checking `isVisible()` on a page that is still settling answers
    // "no" and then the fill below waits out its timeout on a box that was
    // never going to appear on its own.
    const composer = page.getByTestId('happy-composer')
    const addAnother = page.getByRole('button', { name: /add another happy/i })
    await expect(composer.or(addAnother).first()).toBeVisible({ timeout: 20_000 })

    const before = await happyCards(page).count()

    if (!(await composer.isVisible())) {
        await addAnother.click()
        await expect(composer).toBeVisible()
    }

    await composerBox(page).fill(text)

    if (options.mood) {
        // Exact: "Happy" is also a prefix of "Really happy".
        await page.getByRole('radio', { name: options.mood, exact: true }).click()
    }

    if (options.tags?.length) {
        const tagBox = page.getByLabel(/^tags/i)
        for (const tag of options.tags) {
            await tagBox.fill(tag)
            await tagBox.press('Enter')
        }
    }

    await page.getByRole('button', { name: /save this happy|save changes/i }).click()
    await expect(happyCards(page)).toHaveCount(before + 1, { timeout: 15_000 })
}

/** Opens a card's kebab menu and picks an action from it. */
export async function happyAction(page: Page, card: Locator, action: 'Edit' | 'Delete'): Promise<void> {
    await card.getByRole('button', { name: /actions for this happy/i }).click()
    await page.getByRole('menuitem', { name: action }).click()
}

/**
 * Makes the pod unreachable while leaving the app itself loadable.
 *
 * This is the faithful model of a cold start with no signal. Cutting *all*
 * network (`context.setOffline`) would also stop the browser fetching the app's
 * own HTML and JavaScript, which is a different failure: the web build ships no
 * service worker, so a browser with no connection cannot start it at all. The
 * native shells serve the bundle from the device, so for them the app is there
 * and only the pod is missing — which is exactly what this reproduces.
 */
export async function blockPod(page: Page, podOrigin: string): Promise<void> {
    await page.route(`${podOrigin}/**`, route => route.abort('internetdisconnected'))
    // The app words its banner from `navigator.onLine`, so say so too.
    await page.addInitScript(() => {
        Object.defineProperty(window.navigator, 'onLine', { get: () => false, configurable: true })
    })
}

/** Lets the pod be reached again. */
export async function unblockPod(page: Page, podOrigin: string): Promise<void> {
    await page.unroute(`${podOrigin}/**`)
}

/** Cuts the page off from the network, the way a lost connection does. */
export async function goOffline(page: Page): Promise<void> {
    await page.context().setOffline(true)
    // `navigator.onLine` is what the app words its banner from, and Playwright's
    // setOffline does not always fire the event on its own.
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
}

export async function goOnline(page: Page): Promise<void> {
    await page.context().setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
}
