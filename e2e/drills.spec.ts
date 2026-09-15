import { expect, test, type Page } from '@playwright/test';

/**
 * Calculation drills.
 *
 * The exam asks for figures to be worked out, and a multiple-choice bank can only ask
 * whether one is recognised. What matters here is that the marking is honest — a correct
 * calculation is never marked wrong — and that a wrong answer produces the working rather
 * than a bare verdict, because the working is the whole teaching value.
 */

/** Read the drill's own numbers off the page, so the test does the arithmetic itself. */
async function figures(page: Page): Promise<number[]> {
	const values = await page.locator('.given dd').allInnerTexts();
	return values.flatMap((v) => (v.match(/-?\d+(\.\d+)?/g) ?? []).map(Number));
}

async function startOnly(page: Page, label: string): Promise<void> {
	await page.goto('/drills');
	for (const box of await page.getByRole('checkbox').all()) {
		const name = await box.evaluate((el) => el.closest('label')?.textContent ?? '');
		if (!name.includes(label)) await box.uncheck();
	}
	await page.getByRole('button', { name: 'Start' }).click();
}

test('marks a correctly worked rate as correct', async ({ page }) => {
	await startOnly(page, 'Rate');
	const [count, minutes] = await figures(page);
	await page.getByLabel(/Your answer/).fill(String(count / minutes));
	await page.getByRole('button', { name: 'Check' }).click();
	await expect(page.locator('[data-verdict="right"]')).toBeVisible();
});

test('marks a correctly worked percentage as correct', async ({ page }) => {
	await startOnly(page, 'Percentage of opportunities');
	const [correct, total] = await figures(page);
	await page.getByLabel(/Your answer/).fill(String(Math.round((100 * correct) / total)));
	await page.getByRole('button', { name: 'Check' }).click();
	await expect(page.locator('[data-verdict="right"]')).toBeVisible();
});

test('a wrong answer gives the answer and the working, not just a verdict', async ({
	page
}) => {
	await startOnly(page, 'Rate');
	await page.getByLabel(/Your answer/).fill('999');
	await page.getByRole('button', { name: 'Check' }).click();
	await expect(page.locator('[data-verdict="wrong"]')).toBeVisible();
	await expect(page.locator('.said')).toContainText('The answer is');
	// The working is the point: several steps, not one line.
	expect(await page.locator('.working li').count()).toBeGreaterThan(1);
});

test('will not mark an empty or half-typed answer', async ({ page }) => {
	await startOnly(page, 'Rate');
	const check = page.getByRole('button', { name: 'Check' });
	await expect(check).toBeDisabled();
	await page.getByLabel(/Your answer/).fill('.');
	await expect(check).toBeDisabled();
	await page.getByLabel(/Your answer/).fill('2');
	await expect(check).toBeEnabled();
});

test('keeps a tally and moves on to a fresh problem', async ({ page }) => {
	await startOnly(page, 'Rate');
	await expect(page.locator('.progress')).toContainText('0 of 0');

	const [count, minutes] = await figures(page);
	await page.getByLabel(/Your answer/).fill(String(count / minutes));
	await page.getByRole('button', { name: 'Check' }).click();
	await expect(page.locator('.progress')).toContainText('1 of 1 correct');

	await page.getByRole('button', { name: 'Next' }).click();
	// A new problem: the answer field is empty and there is no verdict on screen.
	await expect(page.getByLabel(/Your answer/)).toHaveValue('');
	await expect(page.locator('.verdict')).toHaveCount(0);
});

test('says plainly that these are not exam questions and nothing is saved', async ({
	page
}) => {
	await page.goto('/drills');
	await expect(page.locator('.note')).toContainText('not exam questions');
	await expect(page.locator('.note')).toContainText('Nothing is saved');
});

test('the agreement drills are reachable and mark correctly', async ({ page }) => {
	await startOnly(page, 'Agreement — total count');
	const [a, b] = await figures(page);
	const expected = Math.round((100 * Math.min(a, b)) / Math.max(a, b));
	await page.getByLabel(/Your answer/).fill(String(expected));
	await page.getByRole('button', { name: 'Check' }).click();
	await expect(page.locator('[data-verdict="right"]')).toBeVisible();
});

test('is reachable from home', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: /Calculation drills/ }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calculation drills');
});
