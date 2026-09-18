import { expect, test, type Page } from '@playwright/test';

/**
 * The review sitting, and getting through it on the keyboard.
 *
 * The launch set is a little over two hours of reading and none of it happens, because two
 * hours is not a thing anybody sits down and does. What is asserted here is that the tool
 * now offers a bite with a visible end, that the count it reports is the count of items a
 * human actually read, and that a whole sitting — flags included — can be done without
 * reaching for the mouse.
 */

async function openReview(page: Page): Promise<void> {
	await page.goto('/review');
	await expect(page.getByRole('heading', { name: 'Content review' })).toBeVisible();
	await expect(page.locator('article.card').first()).toBeVisible({ timeout: 30_000 });
}

test('a sitting is offered with what it would cost, and it finishes', async ({ page }) => {
	await openReview(page);

	const start = page.getByRole('button', { name: /^5 items/ });
	await expect(start).toBeVisible();
	// The cost is the point: "have I got time for this right now" is the question that
	// decides whether any reviewing happens at all.
	await expect(start).toContainText(/about \d+ min/);
	await start.click();

	// Position, so a sitting has a middle as well as an end.
	await expect(page.locator('[data-sitting-done]')).toContainText('0 of 5');
	await expect(
		page.getByRole('progressbar', { name: 'Items decided in this sitting' })
	).toBeVisible();

	for (let i = 1; i <= 5; i++) {
		await page.getByRole('button', { name: /^Approve/ }).click();
		if (i < 5) await expect(page.locator('[data-sitting-done]')).toContainText(`${i} of 5`);
	}

	const done = page.locator('[data-sitting="done"]');
	await expect(done).toBeVisible();
	await expect(done.getByRole('heading', { name: 'Sitting done' })).toBeVisible();
	await expect(done).toContainText('5 approved');
	// And it offers the next bite rather than dropping you back into an open-ended queue.
	await expect(done.getByRole('button', { name: /^Another \d+/ })).toBeVisible();
});

test('a whole sitting can be done on the keyboard, flag and all', async ({ page }) => {
	/*
	 * Approving was already one key while flagging was click, type, click — backwards,
	 * because the flag is the decision that carries information. This walks the path that
	 * matters: approve, flag with a reason, and move on, without a single click.
	 */
	await openReview(page);
	await page.getByRole('button', { name: /^5 items/ }).click();

	await page.keyboard.press('a');
	await expect(page.locator('[data-sitting-done]')).toContainText('1 of 5');

	// `f` starts a flag by putting the cursor in the note; it does not flag on its own,
	// because a flag with no reason cannot be acted on later.
	await page.keyboard.press('f');
	await expect(page.locator('#note')).toBeFocused();
	await expect(page.locator('[data-sitting-done]')).toContainText('1 of 5');

	await page.keyboard.type('The non-example reads as an example.');
	await page.keyboard.press('ControlOrMeta+Enter');
	await expect(page.locator('[data-sitting-done]')).toContainText('2 of 5');
	await expect(page.locator('[data-sitting-flagged]')).toHaveCount(0);

	/*
	 * Focus has to leave the note once the flag is submitted, or the next `a` types the
	 * letter a into it instead of approving — which breaks the keyboard flow at the exact
	 * point it is most useful.
	 */
	await expect(page.locator('#note')).not.toBeFocused();

	// And typing in the note must not fire the single-key shortcuts, or writing the word
	// "safe" would approve, skip and flag on the way past.
	await page.keyboard.press('f');
	await expect(page.locator('#note')).toBeFocused();
	await page.keyboard.type('absf');
	await expect(page.locator('#note')).toHaveValue('absf');
	await expect(page.locator('[data-sitting-done]')).toContainText('2 of 5');
});

test('the shortcuts can be found without being told', async ({ page }) => {
	await openReview(page);
	await expect(page.locator('dl.keys')).toHaveCount(0);
	await page.keyboard.press('?');
	const keys = page.locator('dl.keys');
	await expect(keys).toBeVisible();
	await expect(keys).toContainText('Submit the flag you are writing');
	await page.keyboard.press('?');
	await expect(keys).toHaveCount(0);
});

test('a sitting survives a reload, and counts only what was read', async ({ page }) => {
	await openReview(page);
	await page.getByRole('button', { name: /^5 items/ }).click();
	await page.keyboard.press('a');
	await page.keyboard.press('a');
	await expect(page.locator('[data-sitting-done]')).toContainText('2 of 5');

	// A reviewer on a phone will have the tab evicted mid-sitting; the count is derived
	// from the stored decisions rather than held in a counter, so it comes back.
	await page.reload();
	await expect(page.locator('article.card').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('[data-sitting-done]')).toContainText('2 of 5');
});

test('ending a sitting leaves the queue as it was', async ({ page }) => {
	await openReview(page);
	await page.getByRole('button', { name: /^5 items/ }).click();
	await page.keyboard.press('a');
	await page.getByRole('button', { name: 'End the sitting' }).click();

	// Back to the open-ended queue the page has always had, with the offer available again.
	await expect(page.locator('[data-sitting-done]')).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^5 items/ })).toBeVisible();
	await expect(page.locator('article.card').first()).toBeVisible();
});
