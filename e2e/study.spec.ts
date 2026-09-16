import { expect, test } from '@playwright/test';

/*
 * Flashcards are the feature most likely to lose someone's data silently, so the tests
 * check persistence as well as the session flow.
 */

test('a flashcard session runs on taps alone and records progress', async ({ page }) => {
	await page.goto('/study');
	await page.getByLabel('New cards per session').selectOption('5');
	await expect(page.getByText(/New this session/)).toBeVisible();

	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.getByText(/Card 1 of 5/)).toBeVisible();

	// The front shows the term; the answer is hidden until asked for.
	const front = page.getByRole('heading', { level: 2 });
	await expect(front).toBeVisible();
	await expect(page.getByRole('group', { name: /How well did you know it/ })).toHaveCount(0);

	await page.getByRole('button', { name: 'Show answer' }).click();
	await expect(page.getByRole('link', { name: 'Open the full entry' })).toBeVisible();

	// Four grade buttons, each stating when the card comes back.
	const grades = page.getByRole('group', { name: /How well did you know it/ });
	await expect(grades.getByRole('button')).toHaveCount(4);
	await expect(grades.getByRole('button', { name: /Good/ })).toContainText(/m|d|h/);

	await grades.getByRole('button', { name: /Good/ }).click();
	await expect(page.getByText(/Card 2 of 5/)).toBeVisible();

	// "Again" puts the card back into this session.
	await page.getByRole('button', { name: 'Show answer' }).click();
	await page.getByRole('button', { name: /Again/ }).click();
	await expect(page.getByText(/Card 3 of 6/)).toBeVisible();

	await page.getByRole('button', { name: 'End session' }).click();
	await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
	// Assert on the section's text rather than a text locator: the sentence is assembled
	// from several template expressions, which some text matchers treat as separate nodes.
	await expect(page.locator('.summary')).toContainText('You reviewed 2 cards');
});

test('keyboard shortcuts reveal and grade', async ({ page }) => {
	await page.goto('/study');
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.getByText(/Card 1 of/)).toBeVisible();
	await page.keyboard.press('Space');
	await expect(page.getByRole('group', { name: /How well did you know it/ })).toBeVisible();
	await page.keyboard.press('3');
	await expect(page.getByText(/Card 2 of/)).toBeVisible();
});

test('scheduling survives a reload', async ({ page }) => {
	await page.goto('/study');
	await page.getByLabel('New cards per session').selectOption('5');
	await page.getByRole('button', { name: 'Start' }).click();
	await page.getByRole('button', { name: 'Show answer' }).click();
	await page.getByRole('button', { name: /Easy/ }).click();
	await page.getByRole('button', { name: 'End session' }).click();

	await page.reload();
	// One card was graded Easy, so it is in long-term review and not due today.
	await expect(page.locator('.stats')).toContainText(/Learned\s*1/);
	await expect(page.locator('.stats')).toContainText(/Due now\s*0/);
});

test('the deck follows the exam filter', async ({ page }) => {
	await page.goto('/study');
	// The counts are computed after mount; wait for the deck size to be filled in.
	await expect(page.locator('.stats dd').last()).not.toHaveText('0');
	const before = await page.locator('.stats dd').last().innerText();
	await page.getByLabel('Exam', { exact: true }).selectOption('RBT');
	await page.getByLabel('Domain').selectOption('E');
	const after = await page.locator('.stats dd').last().innerText();
	expect(Number(after)).toBeLessThan(Number(before));
	expect(Number(after)).toBeGreaterThan(0);
});

test('a session shows how it is going, not just how far through it is', async ({ page }) => {
	await page.goto('/study');
	await page.getByLabel('New cards per session').selectOption('5');
	await page.getByRole('button', { name: 'Start' }).click();

	/*
	 * The bar is the only thing on the page that says how the session went rather than
	 * how far through it is, so a screen reader gets the position from the role and the
	 * grades from the tally in words — the segment colours are never the only reading.
	 */
	const bar = page.getByRole('progressbar', { name: 'Cards graded' });
	await expect(bar).toHaveAttribute('aria-valuenow', '0');
	await expect(bar).toHaveAttribute('aria-valuemax', '5');

	// The card says which part of the corpus it came from, and which side is showing.
	await expect(page.locator('.card .face')).toHaveText('Term');
	await expect(page.locator('.progress .chip')).toBeVisible();

	await page.getByRole('button', { name: 'Show answer' }).click();
	await expect(page.locator('.card .face')).toHaveText('Answer');
	await page.getByRole('button', { name: /Good/ }).click();

	await expect(bar).toHaveAttribute('aria-valuenow', '1');
	await expect(page.locator('.tally')).toContainText('Good 1');

	await page.getByRole('button', { name: 'Show answer' }).click();
	await page.getByRole('button', { name: /Again/ }).click();
	await expect(page.locator('.tally')).toContainText('Again 1');
	await expect(page.locator('.tally')).toContainText('Good 1');

	// And the summary breaks the session down by grade, each bar carrying its own count.
	await page.getByRole('button', { name: 'End session' }).click();
	const rows = page.locator('.breakdown li');
	await expect(rows).toHaveCount(4);
	await expect(rows.filter({ hasText: 'Again' })).toContainText('1');
	await expect(rows.filter({ hasText: 'Easy' })).toContainText('0');
});
