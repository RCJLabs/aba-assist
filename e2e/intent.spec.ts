import { expect, test, type Page } from '@playwright/test';

/**
 * Plain-language routes into the situations.
 *
 * The matcher's arithmetic is covered in `intent.test.ts`. What only a browser answers:
 * whether the route is there before the fuzzy index loads, whether it survives a filter
 * left set from earlier, and whether an ordinary glossary query is left alone — which is
 * the assertion that matters most, because a false route sends somebody mid-incident to
 * the wrong card.
 */

async function ask(page: Page, query: string) {
	await page.goto('/');
	const box = page.getByRole('searchbox');
	await expect(box).toBeVisible({ timeout: 30_000 });
	await box.fill(query);
}

test('what is happening routes to the card for it', async ({ page }) => {
	await ask(page, 'he keeps hitting his own head');
	await expect(page.locator('.routes')).toBeVisible();
	await expect(page.locator('.routes li').first()).toContainText(/hurting themselves/i);
	await expect(page.locator('.routes [data-escalate="true"]').first()).toContainText(
		/stop and escalate/i
	);
});

test('an ordinary glossary query routes nowhere', async ({ page }) => {
	/*
	 * The assertion this feature lives or dies on. A miss costs nothing — the ranked
	 * results are still there — and a false match is worse than anything it could be worth.
	 */
	await ask(page, 'what is a motivating operation');
	await expect(page.locator('.routes')).toHaveCount(0);
	await expect(page.locator('.results li').first()).toBeVisible();
});

test('the route is there on the first keystroke, before the index loads', async ({ page }) => {
	/*
	 * The reason the table is in the bundle rather than the fetched index. Blocking the
	 * index proves the route does not depend on it.
	 */
	await page.route('**/search-index*.json', (r) => r.abort());
	await ask(page, 'she said she wants to die');
	await expect(page.locator('.routes li').first()).toContainText(
		/want to die|hurt themselves/i
	);
});

test('a filter left set from earlier does not hide the card', async ({ page }) => {
	/*
	 * Set the way the test's own name describes it: a filter left in storage from a previous
	 * visit, applied before the page renders.
	 *
	 * Driving it through the disclosure did not hold. The `open` attribute is written by
	 * Svelte from the filter state, so neither clicking the summary nor setting the property
	 * survives the next render, and under a full suite the panel shut again between opening
	 * it and reaching the select. Seeding storage is both stabler and a truer account of the
	 * situation being tested.
	 */
	await page.goto('/');
	await page.evaluate(() =>
		localStorage.setItem(
			'aba-assist:filter',
			JSON.stringify({ credential: 'all', domain: 'all', category: 'measurement' })
		)
	);
	await page.reload();

	const box = page.getByRole('searchbox');
	await expect(box).toBeVisible({ timeout: 30_000 });
	await box.fill('kid is having a seizure right now');

	// The filter is live — it narrows the ranked results — and the answer is still there.
	await expect(page.getByLabel(/Category/i)).toHaveValue('measurement');
	await expect(page.locator('.routes li')).toHaveCount(1);
});

test('the ranked results are still offered underneath', async ({ page }) => {
	// A route is an answer, not a replacement: the ordinary search is untouched.
	await ask(page, 'he ran out toward the road');
	await expect(page.locator('.routes li')).toHaveCount(1);
	await expect(page.locator('.count')).toBeVisible();
});
