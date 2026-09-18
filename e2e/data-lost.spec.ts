import { expect, test, type Page } from '@playwright/test';

/**
 * Noticing that data was here and is not any more.
 *
 * Most of what is asserted here is restraint. A wrong "your progress has gone" is worse
 * than saying nothing: it sends somebody looking for a backup they never needed and
 * teaches them the app cries wolf, after which the true warning is ignored too. So the
 * cases that matter are the ones where the notice must NOT appear.
 */

const WITNESS = 'aba-assist:data-witness';

/** Claim the app saw data on this device, without having to create any. */
async function seedWitness(page: Page, daysAgo = 9) {
	await page.evaluate(
		([key, days]) => {
			localStorage.setItem(
				key as string,
				JSON.stringify({ seenAt: Date.now() - (days as number) * 86_400_000 })
			);
		},
		[WITNESS, daysAgo] as const
	);
}

const notice = (page: Page) => page.locator('[data-data-lost]');

test('says nothing to a reader who has never stored anything', async ({ page }) => {
	await page.goto('/study');
	await expect(page.locator('[data-study-status]')).toBeAttached({ timeout: 30_000 });
	await expect(notice(page)).toHaveCount(0);
});

test('says so where the loss is felt, once data has gone', async ({ page }) => {
	await page.goto('/study');
	await expect(page.locator('[data-study-status]')).toBeAttached({ timeout: 30_000 });
	await seedWitness(page);
	await page.reload();

	const lost = notice(page);
	await expect(lost).toBeVisible({ timeout: 30_000 });
	await expect(lost).toContainText('9 days ago');
	// Something to do about it, not just bad news.
	await expect(lost.getByRole('link', { name: 'Restore from a backup' })).toBeVisible();

	// And on the other page where the emptiness is visible.
	await page.goto('/progress');
	await expect(notice(page)).toBeVisible({ timeout: 30_000 });
});

test('can be acknowledged by somebody who has no backup', async ({ page }) => {
	/*
	 * A notice you cannot act on and cannot dismiss is a scold on every visit. Somebody
	 * with no backup has nothing to restore, and saying so once is enough.
	 */
	await page.goto('/study');
	await expect(page.locator('[data-study-status]')).toBeAttached({ timeout: 30_000 });
	await seedWitness(page);
	await page.reload();
	await expect(notice(page)).toBeVisible({ timeout: 30_000 });

	await notice(page).getByRole('button', { name: 'Start again without it' }).click();
	await expect(notice(page)).toHaveCount(0);

	// And it stays gone, rather than returning on the next visit.
	await page.reload();
	await expect(page.locator('[data-study-status]')).toBeAttached({ timeout: 30_000 });
	await expect(notice(page)).toHaveCount(0);
});

test('never calls a deliberate deletion a loss', async ({ page }) => {
	/*
	 * The false positive that would be hardest to forgive: greeting somebody who has just
	 * pressed "delete everything" with a warning that their data has gone.
	 */
	await page.goto('/study');
	await expect(page.locator('[data-study-status]')).toBeAttached({ timeout: 30_000 });
	await seedWitness(page, 2);

	await page.goto('/settings');
	await page.getByRole('button', { name: 'Delete my data' }).click();
	await page.getByRole('button', { name: 'Yes, delete it all' }).click();
	await expect(page.locator('p.result')).toContainText('has been deleted');

	await expect(notice(page)).toHaveCount(0);
	await page.goto('/study');
	await expect(page.locator('[data-study-status]')).toBeAttached({ timeout: 30_000 });
	await expect(notice(page)).toHaveCount(0);
});

test('a witness it did not write is ignored rather than read as a loss', async ({ page }) => {
	await page.goto('/study');
	await expect(page.locator('[data-study-status]')).toBeAttached({ timeout: 30_000 });
	await page.evaluate((key) => localStorage.setItem(key, 'not json at all'), WITNESS);
	await page.reload();
	await expect(page.locator('[data-study-status]')).toBeAttached({ timeout: 30_000 });
	await expect(notice(page)).toHaveCount(0);
});
