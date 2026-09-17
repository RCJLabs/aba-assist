import { expect, test, type Page } from '@playwright/test';

/**
 * The supervision parking lot.
 *
 * The agenda arithmetic — oldest first, grouping, the fortnight flag — is covered in
 * `agenda.test.ts`. What only a browser answers: whether a question typed on the page
 * survives a reload, whether the PHI linter fires where a client's name would go, and
 * whether the printed page is a meeting agenda rather than a screenshot of a form.
 */

async function open(page: Page) {
	await page.goto('/tools/questions');
	await expect(page.getByRole('heading', { name: 'Park a question' })).toBeVisible({
		timeout: 30_000
	});
}

async function park(page: Page, text: string) {
	await page.getByLabel('The question').fill(text);
	await page.getByRole('button', { name: 'Park it' }).click();
	await expect(page.getByLabel('The question')).toHaveValue('');
}

test('a parked question survives a reload', async ({ page }) => {
	await open(page);
	await park(page, 'Which prompt level does the plan actually specify?');

	await page.reload();
	await expect(page.locator('.questions')).toContainText('Which prompt level');
	await expect(page.locator('[data-open="1"]')).toBeVisible();
});

test('the linter warns where a name would go, and still lets it through', async ({ page }) => {
	/*
	 * A warning, never a block. This app cannot tell a person's name from a program's, and a
	 * blocker that fires on "Safety Care" teaches people to work around it — so the test
	 * pins both halves: the warning appears, and the question is still parked.
	 */
	await open(page);
	await page.getByLabel('The question').fill('Should I keep running this with Jamie Rivera?');
	await expect(page.locator('.warn')).toContainText(/name/i);

	await page.getByRole('button', { name: 'Park it' }).click();
	await expect(page.locator('.questions')).toContainText('Jamie Rivera');
});

test('the agenda puts the longest wait first', async ({ page }) => {
	await open(page);
	await park(page, 'First question in');
	await park(page, 'Second question in');

	// Both parked in the same second, so this is also the tie-break holding in a browser.
	const items = page.locator('.questions li .q');
	await expect(items.first()).toContainText('First question in');
	await expect(items).toHaveCount(2);
});

test('asking a question takes it off the agenda and leaves it findable', async ({ page }) => {
	await open(page);
	await park(page, 'Does the reinforcer need rotating?');

	await page.getByRole('button', { name: 'Asked it' }).click();
	await expect(page.locator('[data-agenda="empty"]')).toBeVisible();

	// Not deleted — a question you asked is the record that you asked it.
	await expect(page.locator('.questions.done')).toContainText('Does the reinforcer need');
	await page.getByRole('button', { name: 'Put it back' }).click();
	await expect(page.locator('[data-agenda="empty"]')).toHaveCount(0);
});

test('the printed page is the agenda, not the form', async ({ page }) => {
	await open(page);
	await park(page, 'Is this within my scope to change?');
	await page.getByRole('button', { name: 'Asked it' }).click();
	await park(page, 'What counts as an independent response here?');

	await page.emulateMedia({ media: 'print' });

	// The stamp says what the paper is; the form and last meeting's business are gone.
	await expect(page.locator('.printed')).toContainText('Questions for supervision');
	await expect(page.getByRole('heading', { name: 'Park a question' })).toBeHidden();
	await expect(page.locator('.questions.done')).toBeHidden();
	await expect(page.locator('.questions li .q').first()).toContainText('independent response');
	// Every control gone, including the print button that would otherwise print itself.
	await expect(page.getByRole('button', { name: /Print this agenda/ })).toBeHidden();
});
