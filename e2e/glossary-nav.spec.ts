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
