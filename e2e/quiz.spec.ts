import { expect, test } from '@playwright/test';

test('a practice session gives a rationale for every option and a per-area result', async ({
	page
}) => {
	await page.goto('/quiz');
	await page.getByLabel('Exam', { exact: true }).selectOption('RBT');
	await page.getByLabel('Number of questions').selectOption('5');
	// `\s+` rather than a space: the count and the noun are separate template expressions,
	// and the formatter may put a line break between them.
	await expect(page.locator('.setup')).toContainText(/\d+\s+questions available/);
	await page.getByRole('button', { name: 'Start' }).click();

	for (let i = 1; i <= 5; i++) {
		// The progress line, not a text search: the live region announces the same words.
		await expect(page.locator('.progress')).toContainText(`Question ${i} of 5`);
		// The answer button is disabled until something is selected.
		await expect(page.getByRole('button', { name: 'Check answer' })).toBeDisabled();
		await page.getByRole('radio').first().check();
		await page.getByRole('button', { name: 'Check answer' }).click();

		// Feedback: every option carries a rationale, and the verdict is stated in words.
		await expect(page.locator('.rationale')).toHaveCount(4);
		await expect(page.getByRole('region', { name: 'Explanation' })).toBeVisible();
		await expect(page.locator('.verdict')).toHaveText(/Correct\.|Not correct\./);

		await page.getByRole('button', { name: i < 5 ? 'Next question' : 'See results' }).click();
	}

	await expect(page.getByRole('heading', { name: /\d of 5 correct/ })).toBeVisible();
	await expect(page.getByRole('table')).toBeVisible();
});

test('test mode withholds feedback until the end', async ({ page }) => {
	await page.goto('/quiz');
	await page.getByLabel('Number of questions').selectOption('5');
	await page.getByRole('radio', { name: /At the end/ }).check();
	await page.getByRole('button', { name: 'Start' }).click();
	await page.getByRole('radio').first().check();
	await page.getByRole('button', { name: 'Check answer' }).click();
	await expect(page.locator('.rationale')).toHaveCount(0);
	await expect(page.locator('.progress')).toContainText('Question 2 of 5');
});

test('a single area can be drilled, and the BCBA bank is separate', async ({ page }) => {
	await page.goto('/quiz');
	await page.getByLabel('Exam', { exact: true }).selectOption('BCBA');
	await page.getByLabel('Content area').selectOption('D');
	await expect(page.locator('.setup')).toContainText('5 questions available');
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('.progress')).toContainText(/BCBA\s+D\.\d/);
});

test('a negated question is flagged before the reader answers it', async ({ page }) => {
	await page.goto('/quiz');
	await page.getByLabel('Exam', { exact: true }).selectOption('RBT');
	await page.getByLabel('Content area').selectOption('E');
	await page.getByLabel('Number of questions').selectOption('1000');
	await page.getByRole('button', { name: 'Start' }).click();

	// Walk the whole area; exactly one E question is negated and it must show the callout.
	let seen = 0;
	for (let i = 0; i < 20; i++) {
		if (await page.locator('.callout').isVisible()) seen++;
		await page.getByRole('radio').first().check();
		await page.getByRole('button', { name: 'Check answer' }).click();
		const next = page.getByRole('button', { name: /Next question|See results/ });
		const label = await next.innerText();
		await next.click();
		if (label.includes('See results')) break;
	}
	expect(seen).toBe(1);
});
