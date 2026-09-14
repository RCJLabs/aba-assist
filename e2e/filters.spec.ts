import { expect, test } from '@playwright/test';

/*
 * The exam / domain / category filter is the "drop-down tabs" feature: one control that
 * narrows the glossary, search, flashcards and quiz to what is on a particular exam.
 */

test('the glossary filter narrows by exam and by domain, and persists across a reload', async ({
	page
}) => {
	await page.goto('/glossary');
	const all = await page.locator('section li').count();
	expect(all).toBeGreaterThan(100);

	await page.getByLabel('Exam', { exact: true }).selectOption('RBT');
	await expect(page.getByText(/Showing \d+ of \d+ terms/)).toBeVisible();
	const rbt = await page.locator('section li').count();
	expect(rbt).toBeGreaterThan(0);
	expect(rbt).toBeLessThan(all);

	// The domain list only appears once an exam is chosen, and it comes from the outline.
	const domain = page.getByLabel('Domain');
	await expect(domain).toBeVisible();
	await domain.selectOption('F');
	await expect(page.locator('.count')).toContainText('F. Ethics');
	const ethics = await page.locator('section li').count();
	expect(ethics).toBeGreaterThan(0);
	expect(ethics).toBeLessThan(rbt);

	await page.reload();
	await expect(page.getByLabel('Exam', { exact: true })).toHaveValue('RBT');
	await expect(page.getByLabel('Domain')).toHaveValue('F');
	expect(await page.locator('section li').count()).toBe(ethics);

	await page.getByRole('button', { name: 'Clear filters' }).click();
	expect(await page.locator('section li').count()).toBe(all);
});

test('the category filter shows only that category', async ({ page }) => {
	await page.goto('/glossary');
	await page.getByLabel('Category').selectOption('verbal-behavior');
	await expect(page.getByRole('heading', { level: 2, name: /Verbal behavior/ })).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: /Measurement/ })).toHaveCount(0);
	await expect(page.getByRole('link', { name: /^Mand/ })).toBeVisible();
});

test('search results respect the exam filter', async ({ page }) => {
	await page.goto('/');
	await page.getByLabel('Search terms').fill('validity');
	// Internal and external validity are BCBA-outline terms with no RBT tagging.
	await expect(page.getByRole('link', { name: /Internal Validity/ })).toBeVisible();

	// The filter sits in a closed <details> on the home page; open it first.
	await page.locator('details.filter-box summary').click();
	await page
		.getByRole('group', { name: 'Filter search results' })
		.getByLabel('Exam', { exact: true })
		.selectOption('RBT');
	await expect(page.getByRole('link', { name: /Internal Validity/ })).toHaveCount(0);
	// Social validity is tagged to the RBT ethics area, so it survives the filter.
	await expect(page.getByRole('link', { name: /Social Validity/ })).toBeVisible();
});

test('an exam page can set the filter for flashcards', async ({ page }) => {
	await page.goto('/exams/bcba-tco-6');
	await page.getByRole('link', { name: 'Flashcards for this exam' }).click();
	await expect(page).toHaveURL(/\/study$/);
	await expect(page.getByLabel('Exam', { exact: true })).toHaveValue('BCBA');
});
