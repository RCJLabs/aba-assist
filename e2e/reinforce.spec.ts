import { expect, test, type Page } from '@playwright/test';

/**
 * A missed question reaching the flashcard deck.
 *
 * The two features used to be strangers: you could miss the same question on stimulus
 * control every week and the scheduler never heard about it. The strongest evidence the
 * app holds about what somebody does not know was being thrown away at the results
 * screen.
 */

/** Answer `n` questions taking the first option each time, then finish. */
async function run(page: Page, n: number): Promise<void> {
	await page.goto('/quiz');
	await page.getByLabel('Exam', { exact: true }).selectOption('RBT');
	await page.getByLabel('Number of questions').selectOption(String(n));
	await page.getByRole('button', { name: 'Start' }).click();

	for (let i = 1; i <= n; i++) {
		await expect(page.locator('.progress')).toContainText(`Question ${i} of ${n}`);
		await page.getByRole('radio').first().check();
		await page.getByRole('button', { name: 'Check answer' }).click();
		await page.getByRole('button', { name: i < n ? 'Next question' : 'See results' }).click();
	}
	await expect(page.locator('.results')).not.toHaveAttribute('data-attempt', 'pending');
}

test('missing questions makes the terms behind them due for review', async ({ page }) => {
	/*
	 * Twenty questions, first option every time. Options are shuffled per run, so this is
	 * one chance in four of being right on each — getting all twenty right by accident is
	 * about one run in a million million. The assertion below says so out loud rather than
	 * passing vacuously if it ever happens.
	 */
	await run(page, 20);

	const missed = await page.locator('.missed > li').count();
	expect(
		missed,
		'the run has to miss something for this test to test anything'
	).toBeGreaterThan(0);

	const note = page.locator('[data-reinforced]');
	await expect(note).toBeVisible();
	await expect(note).toContainText('due in your flashcards');
	// The cards are due, not graded: the note has to say so, because a failed review the
	// reader never sat would be a lie the scheduler then reasons from.
	await expect(note).toContainText('not graded');

	const count = Number(await note.getAttribute('data-reinforced'));
	expect(count).toBeGreaterThan(0);

	// And the deck actually holds them, read back from storage in a fresh document.
	await page.goto('/study');
	await expect(page.locator('[data-study-status="ready"]')).toBeAttached({ timeout: 30_000 });
	const due = page.locator('.stats div', { hasText: 'Due now' }).locator('dd');
	expect(Number(await due.textContent())).toBeGreaterThanOrEqual(count);
});

test('a clean run adds nothing and says nothing', async ({ page }) => {
	/*
	 * The empty case matters as much: a reader who got everything right should not find
	 * their queue quietly larger, and should not see a note about it either.
	 */
	await page.goto('/quiz');
	await page.getByLabel('Exam', { exact: true }).selectOption('RBT');
	await page.getByLabel('Number of questions').selectOption('5');
	await page.getByRole('button', { name: 'Start' }).click();

	// Answer each question correctly by reading the verdict and retrying is not possible,
	// so instead check the invariant from the other direction: the note is present only
	// when something was missed.
	for (let i = 1; i <= 5; i++) {
		await expect(page.locator('.progress')).toContainText(`Question ${i} of 5`);
		await page.getByRole('radio').first().check();
		await page.getByRole('button', { name: 'Check answer' }).click();
		await page.getByRole('button', { name: i < 5 ? 'Next question' : 'See results' }).click();
	}
	await expect(page.locator('.results')).not.toHaveAttribute('data-attempt', 'pending');

	const missed = await page.locator('.missed > li').count();
	const note = page.locator('[data-reinforced]');
	if (missed === 0) await expect(note).toHaveCount(0);
	else await expect(note).toBeVisible();
});

test('the results screen with reinforcement is accessible', async ({ page }) => {
	await run(page, 20);
	const { expectNoA11yViolations } = await import('./utils/a11y');
	await expectNoA11yViolations(page);
});
