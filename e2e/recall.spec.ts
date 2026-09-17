import { expect, test, type Page } from '@playwright/test';

/**
 * Writing the definition before checking it.
 *
 * The scheduler is unchanged and is covered elsewhere; nothing here re-tests grading. What
 * this covers is the one thing the mode exists for — that the reader's own words end up
 * beside the answer — and the two ways it could quietly fail: a grade path that needs
 * something typed, and grade keys that go dead because focus is still in the textarea.
 */

async function startRecall(page: Page) {
	await page.goto('/study');
	await expect(page.getByRole('button', { name: 'Start' })).toBeEnabled({ timeout: 30_000 });
	await page.getByRole('checkbox', { name: /Write it before you check/ }).check();
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.getByLabel(/Write the definition/)).toBeVisible();
}

test('what you wrote is shown beside the answer', async ({ page }) => {
	await startRecall(page);
	await page.getByLabel(/Write the definition/).fill('Something I half remember');
	await page.getByRole('button', { name: 'Check it' }).click();

	await expect(page.locator('.compare .mine')).toHaveText('Something I half remember');
	await expect(page.locator('[data-attempt="written"]')).toBeVisible();
	// And the real answer is there too, or there is nothing to compare against.
	await expect(page.locator('.back p').nth(1)).not.toBeEmpty();
});

test('checking with nothing written is allowed and says so', async ({ page }) => {
	/*
	 * Not being able to write it is an answer, and it is the one most worth grading
	 * honestly. A mode that refused to continue would teach people to type a character.
	 */
	await startRecall(page);
	await page.getByRole('button', { name: 'Check it' }).click();
	await expect(page.locator('[data-attempt="blank"]')).toContainText(/did not write/i);
	await page.getByRole('button', { name: /Again/ }).click();
	await expect(page.getByLabel(/Write the definition/)).toBeVisible();
});

test('the grade keys work straight after checking', async ({ page }) => {
	/*
	 * The key handler ignores 1 to 4 while a textarea has focus, which is right — and would
	 * leave the grade keys dead after typing, with nothing on screen explaining why. Focus
	 * moves to the grades on check.
	 */
	await startRecall(page);
	await page.getByLabel(/Write the definition/).fill('An attempt');
	await page.getByRole('button', { name: 'Check it' }).click();
	await expect(page.locator('.grades button').first()).toBeFocused();

	await page.keyboard.press('3');
	await expect(page.getByLabel(/Write the definition/)).toBeVisible();
});

test('the next card starts empty rather than holding the last answer', async ({ page }) => {
	await startRecall(page);
	await page.getByLabel(/Write the definition/).fill('First card');
	await page.getByRole('button', { name: 'Check it' }).click();
	await page.getByRole('button', { name: /Good/ }).click();
	await expect(page.getByLabel(/Write the definition/)).toHaveValue('');
});

test('the mode is remembered, and off by default', async ({ page }) => {
	await page.goto('/study');
	const toggle = page.getByRole('checkbox', { name: /Write it before you check/ });
	await expect(toggle).not.toBeChecked();

	await toggle.check();
	await page.reload();
	await expect(
		page.getByRole('checkbox', { name: /Write it before you check/ })
	).toBeChecked();

	// And the ordinary path is untouched when it is off.
	await page.getByRole('checkbox', { name: /Write it before you check/ }).uncheck();
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible();
	await expect(page.getByLabel(/Write the definition/)).toHaveCount(0);
});
