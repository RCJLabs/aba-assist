import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './utils/a11y';

/**
 * The review queue is the one route in the app built for the person maintaining it
 * rather than for a reader, and it is the gate on everything shipping: nothing reaches
 * the release channel until a human has approved it here and the export has been applied
 * to the content files. So it gets the same treatment as the reader-facing routes.
 */

async function openQueue(page: Page): Promise<void> {
	await page.goto('/review');
	await expect(page.locator('[data-review-status="ready"]')).toBeAttached({ timeout: 30_000 });
}

test('loads the whole corpus and shows one item at a time', async ({ page }) => {
	await openQueue(page);

	await expect(page.getByRole('heading', { name: 'Content review' })).toBeVisible();
	const left = page.locator('.stats').getByText(/^\d+$/).last();
	await expect(left).toBeVisible();

	// Exactly one item card, with its provenance on screen.
	await expect(page.locator('article.card')).toHaveCount(1);
	await expect(
		page.locator('article.card').getByRole('heading', { name: 'Written from' })
	).toBeVisible();
});

test('an approval sticks across a reload', async ({ page }) => {
	await openQueue(page);

	const title = await page.locator('article.card h2').innerText();
	await page.getByRole('button', { name: /^Approve/ }).click();
	await expect(page.locator('.stats').getByText('1', { exact: true }).first()).toBeVisible();

	// The queue moved on, because decided items are hidden by default.
	await expect(page.locator('article.card h2')).not.toHaveText(title);

	await page.reload();
	await expect(page.locator('[data-review-status="ready"]')).toBeAttached({ timeout: 30_000 });
	await expect(page.locator('article.card h2')).not.toHaveText(title);
	await expect(page.locator('.stats')).toContainText('Approved');
});

test('flagging is refused without a note saying what is wrong', async ({ page }) => {
	await openQueue(page);

	const flag = page.getByRole('button', { name: 'Needs a change' });
	await expect(flag).toBeDisabled();

	await page
		.getByLabel('What needs changing (required to flag)')
		.fill('The non-example is an example.');
	await expect(flag).toBeEnabled();
	await flag.click();

	// The note is cleared for the next item, and the count moved.
	await expect(page.getByLabel('What needs changing (required to flag)')).toHaveValue('');
	await expect(page.locator('.stats')).toContainText('Flagged');
});

test('the export is refused until the reviewer identifies themselves', async ({ page }) => {
	await openQueue(page);
	await page.getByRole('button', { name: /^Approve/ }).click();

	const download = page.getByRole('button', { name: 'Download decisions' });
	await expect(download).toBeDisabled();

	const reviewer = page.getByLabel('Your reviewer id (lower-case, no spaces)');
	await reviewer.fill('Evan Cook');
	await expect(download).toBeDisabled();
	await expect(page.getByText(/lower-case letters, digits and hyphens/)).toBeVisible();

	await reviewer.fill('evan');
	await expect(download).toBeEnabled();
});

test('the exported payload is what apply-review consumes', async ({
	page,
	context,
	browserName
}) => {
	test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-only here.');
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await openQueue(page);
	await page.getByRole('button', { name: /^Approve/ }).click();
	await page.getByLabel('Your reviewer id (lower-case, no spaces)').fill('evan');
	await page.getByRole('button', { name: 'Copy to clipboard' }).click();
	await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

	const payload = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
	expect(payload.reviewer).toBe('evan');
	expect(Array.isArray(payload.decisions)).toBe(true);
	expect(payload.decisions).toHaveLength(1);
	expect(payload.decisions[0]).toMatchObject({ decision: 'approved', note: '' });
	expect(typeof payload.decisions[0].id).toBe('string');
	expect(typeof payload.decisions[0].kind).toBe('string');
});

test('the filter narrows the queue to one kind', async ({ page }) => {
	await openQueue(page);

	await page.getByLabel('Reviewing', { exact: true }).selectOption('scenario');
	await expect(page.locator('article.card .kind')).toContainText('Situation');
});

test('discarding decisions asks first', async ({ page }) => {
	await openQueue(page);
	await page.getByRole('button', { name: /^Approve/ }).click();

	await page.getByRole('button', { name: 'Discard decisions' }).click();
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('button', { name: 'Discard decisions' })).toBeVisible();

	await page.getByRole('button', { name: 'Discard decisions' }).click();
	await page.getByRole('button', { name: /^Really discard all/ }).click();
	await expect(page.getByRole('button', { name: 'Download decisions' })).toBeDisabled();
});

test('the loaded queue has no axe violations', async ({ page }) => {
	await openQueue(page);
	await expectNoA11yViolations(page);
});

test('the queue is reachable from settings and kept out of the index', async ({ page }) => {
	await page.goto('/settings');
	await page.getByRole('link', { name: 'Open the content review queue' }).click();
	await expect(page).toHaveURL(/\/review\/?$/);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});
