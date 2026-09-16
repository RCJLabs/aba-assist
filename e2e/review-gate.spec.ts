import { expect, test, type Page } from '@playwright/test';

/**
 * The release gate on the review queue.
 *
 * The queue's problem was never that it lacked items. It showed one number — how many
 * entries were unreviewed — which is true and is not what stands between this app and a
 * reader. These tests hold the distinction: the gate counts the four complete-or-nothing
 * kinds and the glossary floor, it never lets a local decision pass for an approval, and
 * it can reduce the queue to what it is waiting on.
 */

async function openReview(page: Page): Promise<void> {
	await page.goto('/review');
	await expect(page.locator('.gate')).toBeVisible({ timeout: 30_000 });
}

test('leads with what a release is waiting on, not the backlog', async ({ page }) => {
	await openReview(page);
	await expect(page.locator('.gate h2')).toHaveText('Getting this published');
	await expect(page.locator('.gate')).toHaveAttribute('data-gate', 'open');
	await expect(page.locator('.gate .verdict')).toContainText(
		'between this app and an indexed site'
	);
	// And it says the backlog below is not the measure.
	await expect(page.locator('.gate .verdict')).toContainText('not the wall');
});

test('names each required kind and the glossary floor', async ({ page }) => {
	await openReview(page);
	for (const id of ['outline', 'ethics-code', 'credential', 'escalation', 'terms']) {
		await expect(page.locator(`[data-req="${id}"]`)).toBeVisible();
	}
	// The floor is the number the build enforces, not a round figure chosen here.
	await expect(page.locator('[data-req="terms"]')).toContainText('of 150');
});

test('counts escalation cards rather than every situation', async ({ page }) => {
	// 12 escalation cards against 60 situations: the gate needs the smaller set whole.
	await openReview(page);
	await expect(page.locator('[data-req="escalation"]')).toContainText('of 12');
});

test('a decision made here is pending until it is exported', async ({ page }) => {
	await openReview(page);
	await page.getByRole('button', { name: 'Review only what the gate needs' }).click();

	const before = await page.locator('.gate .verdict strong').innerText();
	await page.getByRole('button', { name: /^Approve/ }).click();

	/*
	 * A build reads the content files, so approving here must move nothing in the
	 * approved counts. It shows as pending instead, and the remaining figure holds.
	 */
	await expect(
		page.locator('.gate .flag').filter({ hasText: 'pending export' })
	).not.toHaveCount(0);
	await expect(page.locator('.gate .verdict strong')).toHaveText(before);
	await expect(page.locator('[data-gate="met"]')).toHaveCount(0);
});

test('can reduce the queue to the entries the gate needs', async ({ page }) => {
	await openReview(page);
	const toggle = page.getByRole('button', { name: 'Review only what the gate needs' });
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await toggle.click();
	// The label stays put; aria-pressed is what changes.
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');

	// Every item offered is now one the gate is waiting on.
	await expect(page.locator('article.card')).toHaveCount(1);
	await expect(page.locator('.gate .verdict')).toContainText('between this app');
});

test('is honest that decisions have not reached the content files', async ({ page }) => {
	await openReview(page);
	await expect(page.locator('.gate-note')).toContainText('have not reached the content files');
});
