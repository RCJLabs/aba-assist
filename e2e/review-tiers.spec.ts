import { expect, test, type Page } from '@playwright/test';

/**
 * Tiered review.
 *
 * The property worth asserting is not that the buttons work, it is that the ordering
 * cannot be talked around: an escalation card must never appear in a tier that can be
 * approved by sample, and a batch whose draw turned up a problem must not offer to carry
 * the rest anyway.
 */

async function openReview(page: Page): Promise<void> {
	await page.goto('/review');
	await expect(page.getByRole('heading', { name: 'Content review' })).toBeVisible();
	await expect(page.locator('article.card').first()).toBeVisible({ timeout: 30_000 });
}

test('the queue opens on the tier that has to be read', async ({ page }) => {
	await openReview(page);
	await expect(page.getByRole('button', { name: /Tier A/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	// Every tier states its remaining load in minutes, which is the point: 456 unreviewed
	// is a wall, "92 to read, about 276 min" is a plan.
	await expect(page.getByRole('button', { name: /Tier A/ })).toContainText(/about \d+ min/);
	await expect(page.locator('.badge[data-tier="A"]').first()).toBeVisible();
});

test('a situation is never sampleable, whatever tier is selected', async ({ page }) => {
	await openReview(page);

	// Walk the top tier far enough to meet a situation, and confirm what it is filed as.
	await page.getByLabel('Reviewing').selectOption('scenario');
	const card = page.locator('article.card').first();
	await expect(card).toBeVisible();
	await expect(card.locator('.badge')).toHaveAttribute('data-tier', 'A');
	await expect(card).toContainText('a situation somebody acts on');

	// And selecting the sampled tier removes them from the queue entirely.
	await page.getByRole('button', { name: /Tier C/ }).click();
	await expect(page.getByText('Nothing left in this selection')).toBeVisible();
});

test('only the glossary offers batches, and only its ordinary definitions', async ({
	page
}) => {
	await openReview(page);
	await page.getByRole('button', { name: /Tier C/ }).click();
	await page.getByLabel('Reviewing').selectOption('all');

	const batches = page.locator('.batches li');
	await expect(batches.first()).toBeVisible();
	const names = await batches.locator('strong').allInnerTexts();
	// Ethics and supervision definitions are obligations, so they are read, not sampled.
	expect(names).not.toContain('ethics');
	expect(names).not.toContain('supervision');
	expect(names.length).toBeGreaterThan(3);

	// Nothing can be carried before its draw has been read.
	for (const button of await batches.getByRole('button').all()) {
		await expect(button).toBeDisabled();
	}
});

test('reading a whole draw unlocks carrying the batch, and says how many', async ({
	page
}) => {
	await openReview(page);
	await page.getByRole('button', { name: /Tier C/ }).click();

	// Work through one category's draw. Filtering by kind keeps the queue to terms.
	await page.getByLabel('Reviewing').selectOption('term');
	const target = page.locator('.batches li').first();
	const name = (await target.locator('strong').innerText()).trim();
	const before = await target.getByRole('button').innerText();
	expect(before).toMatch(/Carry \d+ on this draw/);

	// Approve items until this batch's draw is clean. The queue only ever contains drawn
	// items in this tier, so approving through it is exactly reading the draws.
	for (let i = 0; i < 60; i++) {
		if (!(await target.getByRole('button').isDisabled())) break;
		const card = page.locator('article.card').first();
		if (!(await card.isVisible())) break;
		await page.getByRole('button', { name: /^Approve/ }).click();
		await page.waitForTimeout(30);
	}

	const carry = target.getByRole('button');
	await expect(carry, `batch ${name}`).toBeEnabled();
	await carry.click();
	await expect(target.getByRole('button')).toContainText('Carried');
	await expect(target).toHaveAttribute('data-state', 'carried');
});

test('the export records which approvals were read and which a draw carried', async ({
	page
}) => {
	await openReview(page);
	await page.getByRole('button', { name: /Tier C/ }).click();
	await page.getByLabel('Reviewing').selectOption('term');

	const target = page.locator('.batches li').first();
	for (let i = 0; i < 60; i++) {
		if (!(await target.getByRole('button').isDisabled())) break;
		if (!(await page.locator('article.card').first().isVisible())) break;
		await page.getByRole('button', { name: /^Approve/ }).click();
		await page.waitForTimeout(30);
	}
	await target.getByRole('button').click();
	await expect(target.getByRole('button')).toContainText('Carried');

	await page.getByLabel(/reviewer id/i).fill('evan');
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: /Download/ }).click();
	const file = await download;
	const stream = await file.createReadStream();
	const chunks: Buffer[] = [];
	for await (const c of stream) chunks.push(c as Buffer);
	const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));

	const read = payload.decisions.filter((d: { method?: string }) => d.method === 'read');
	const carried = payload.decisions.filter((d: { method?: string }) => d.method === 'sampled');
	expect(read.length).toBeGreaterThan(0);
	expect(carried.length).toBeGreaterThan(0);
	// A carried approval names the draw that carried it, so the basis survives into git.
	for (const d of carried) expect(d.sampledWith).toMatch(/^term:[a-z-]+@[^:]+:\d+-of-\d+$/);
});

test('one flagged item in a draw stops the whole batch being carried', async ({ page }) => {
	await openReview(page);
	await page.getByRole('button', { name: /Tier C/ }).click();
	await page.getByLabel('Reviewing').selectOption('term');

	const target = page.locator('.batches li').first();

	// Flag the first item in this batch's draw, then clear the rest.
	await page.getByLabel(/What needs changing/).fill('The non-example is really an example.');
	await page.getByRole('button', { name: 'Needs a change' }).click();

	for (let i = 0; i < 60; i++) {
		if (!(await page.locator('article.card').first().isVisible())) break;
		if ((await target.getAttribute('data-state')) === 'flagged') break;
		await page.getByRole('button', { name: /^Approve/ }).click();
		await page.waitForTimeout(30);
	}

	/*
	 * The draw said something, and what it said was that this batch needs reading. Carrying
	 * the rest anyway would make the whole exercise a formality.
	 */
	await expect(target).toHaveAttribute('data-state', 'flagged');
	await expect(target).toContainText('needs reading');
	await expect(target.getByRole('button')).toBeDisabled();
});
