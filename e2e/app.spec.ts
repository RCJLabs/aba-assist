import { expect, test } from '@playwright/test';

test('home page search filters the glossary', async ({ page }) => {
	await page.goto('/');
	await page.getByLabel('Search terms').fill('motivating');
	await expect(page.getByRole('link', { name: /Motivating Operation/ })).toBeVisible();
	await expect(page.getByText(/^1 result$/)).toBeVisible();
});

test('search matches an alias, not just the term name', async ({ page }) => {
	await page.goto('/');
	// "MO" is an alias of Motivating Operation.
	await page.getByLabel('Search terms').fill('MO');
	await expect(page.getByRole('link', { name: /Motivating Operation/ })).toBeVisible();
});

test('a term page renders both definitions and can toggle between them', async ({ page }) => {
	await page.goto('/glossary/negative-reinforcement');
	await expect(
		page.getByRole('heading', { level: 1, name: 'Negative Reinforcement' })
	).toBeVisible();

	// The technical definition is the default, so a reader with no JS still gets content.
	await expect(page.getByText(/removed, reduced, or postponed/)).toBeVisible();

	await page.getByRole('button', { name: /plain language/i }).click();
	await expect(page.getByText(/Negative here means something was taken away/)).toBeVisible();
});

test('term pages are prerendered — content is in the HTML without JavaScript', async ({
	browser
}) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto('/glossary/motivating-operation');
	await expect(
		page.getByRole('heading', { level: 1, name: 'Motivating Operation' })
	).toBeVisible();
	await expect(page.getByText(/alters the current effectiveness/)).toBeVisible();
	await context.close();
});

test('cross-references between terms navigate correctly', async ({ page }) => {
	await page.goto('/glossary/motivating-operation');
	await page
		.getByRole('link', { name: 'Discriminative Stimulus', exact: true })
		.first()
		.click();
	await expect(page).toHaveURL(/glossary\/discriminative-stimulus/);
	await expect(
		page.getByRole('heading', { level: 1, name: 'Discriminative Stimulus' })
	).toBeVisible();
});

test('the content version is shown so staleness is visible', async ({ page }) => {
	await page.goto('/about');
	await expect(page.getByText(/Content version/)).toBeVisible();
	await expect(page.getByText(/3rd ed\./)).toBeVisible();
});

test('focus moves to main content after navigation', async ({ page }) => {
	await page.goto('/');
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Glossary' })
		.click();
	await expect(page).toHaveURL(/\/glossary$/);
	const focusedId = await page.evaluate(() => document.activeElement?.id);
	expect(focusedId).toBe('main');
});
