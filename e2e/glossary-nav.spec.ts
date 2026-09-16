import { expect, test } from '@playwright/test';

/**
 * Getting around 259 terms.
 *
 * The page is twelve sections deep and the filters above it only narrow — they do not
 * help somebody who knows they want measurement. These hold the two things that do: an
 * index that costs one row until it is asked for, and a heading that stays on screen so
 * the answer to "which category am I in" never requires scrolling back.
 */

const index = (page: import('@playwright/test').Page) => page.locator('.index');

test('the index costs one row until it is opened', async ({ page }) => {
	await page.goto('/glossary');

	/*
	 * Twelve targets at the 44px this app holds itself to is most of a phone screen, in
	 * front of the terms. Closed, it is one row — which is the whole reason it is a
	 * disclosure rather than a permanent strip of chips.
	 */
	const closed = await index(page).evaluate((el) => el.getBoundingClientRect().height);
	expect(closed).toBeLessThan(60);
	await expect(index(page).getByRole('link')).toHaveCount(0);

	await index(page).locator('summary').click();
	await expect(index(page).getByRole('link')).toHaveCount(12);
});

test('a category in the index jumps to that section', async ({ page }) => {
	await page.goto('/glossary');
	await index(page).locator('summary').click();
	await index(page)
		.getByRole('link', { name: /Measurement/ })
		.click();

	// The section heading is what should be on screen afterwards, not the top of the page.
	const head = page.locator('#measurement .cat-head');
	await expect(head).toBeInViewport();
	await expect(head.getByRole('heading', { level: 2 })).toContainText('Measurement');
});

test('the index offers only categories the filter has left', async ({ page }) => {
	await page.goto('/glossary');
	await index(page).locator('summary').click();
	await expect(index(page).getByRole('link')).toHaveCount(12);

	/*
	 * An index that offers a category with nothing in it is worse than no index: it is a
	 * link to an empty room.
	 */
	await page.getByLabel('Category', { exact: true }).selectOption('measurement');
	await expect(index(page)).toHaveCount(0);

	await page.getByLabel('Exam', { exact: true }).selectOption('RBT');
	await page.getByLabel('Category', { exact: true }).selectOption('all');
	// Narrowing to one category removed the index entirely, so widening rebuilds it shut.
	await index(page).locator('summary').click();
	const shown = await index(page).getByRole('link').count();
	expect(shown).toBeGreaterThan(0);
	expect(shown).toBeLessThanOrEqual(12);
});

test('the category heading stays on screen while its terms scroll past', async ({ page }) => {
	await page.goto('/glossary');
	const head = page.locator('#measurement .cat-head');
	await head.scrollIntoViewIfNeeded();
	await expect(head).toBeInViewport();

	// Far enough to leave the section's first terms behind, and it is still there.
	await page.mouse.wheel(0, 1200);
	await expect(head).toBeInViewport();
	await expect(head).toContainText('Measurement');

	// And it carries the way back, so a long category does not strand the reader.
	await head.getByRole('link', { name: 'Index' }).click();
	await expect(index(page)).toBeInViewport();
});

/**
 * Telling an example from a non-example.
 *
 * Two lists that look alike and mean opposite things, read mid-page by somebody who has
 * scrolled past the heading. The mark has to say which on every item, and it has to be
 * the third signal rather than the only one.
 */
test.describe('examples and non-examples', () => {
	test('every item says which kind it is, in a mark and in the heading', async ({ page }) => {
		await page.goto('/glossary/negative-reinforcement');

		const examples = page.locator('.examples:not(.non) li');
		const non = page.locator('.examples.non li');
		await expect(examples.first()).toBeVisible();
		await expect(non.first()).toBeVisible();

		for (const li of await examples.all()) {
			await expect(li.locator('.mark')).toHaveText('✓');
		}
		for (const li of await non.all()) {
			await expect(li.locator('.mark')).toHaveText('✗');
		}

		// The words carry it too, so the mark is never the only reading.
		await expect(page.getByRole('heading', { name: /^Examples?$/ })).toBeVisible();
		await expect(
			page.getByRole('heading', { name: /^Not negative reinforcement$/ })
		).toBeVisible();
	});

	test('the mark is decoration, not something to read aloud', async ({ page }) => {
		await page.goto('/glossary/negative-reinforcement');
		/*
		 * A screen reader announcing "tick" before each example adds noise to a list the
		 * heading has already named. The mark is for the eye that skipped the heading.
		 */
		await expect(page.locator('.examples .mark').first()).toHaveAttribute(
			'aria-hidden',
			'true'
		);
	});

	test('an example says where it happens, and stays quiet when it could be anywhere', async ({
		page
	}) => {
		await page.goto('/glossary/negative-reinforcement');
		await expect(page.locator('.examples .where').first()).toHaveText(/at |in /);

		// Every example on this entry could happen anywhere, so none of them claims a place.
		await page.goto('/glossary/level');
		await expect(page.locator('.examples li').first()).toBeVisible();
		await expect(page.locator('.examples .where')).toHaveCount(0);
	});
});
