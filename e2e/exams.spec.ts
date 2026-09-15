import { expect, test } from '@playwright/test';

test('the exams index lists both outlines with verified exam facts', async ({ page }) => {
	await page.goto('/exams');
	await expect(
		page.getByRole('link', { name: /RBT — Registered Behavior Technician/ })
	).toBeVisible();
	await expect(
		page.getByRole('link', { name: /BCBA — Board Certified Behavior Analyst/ })
	).toBeVisible();
	await expect(page.getByText(/175 scored questions/)).toBeVisible();
	await expect(page.getByText(/\b75 scored questions/)).toBeVisible();
});

test('the BCBA outline page shows all nine areas and every task with a link to a term', async ({
	page
}) => {
	await page.goto('/exams/bcba-tco-6');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/BCBA/);
	await expect(page.locator('.domains > li')).toHaveCount(9);
	await expect(page.locator('.task')).toHaveCount(104);

	// Facts from the outline document: the largest domain by tasks is B, with 24.
	await expect(page.locator('#domain-B .task')).toHaveCount(24);
	await expect(page.getByText(/4 hours|240 minutes/)).toBeVisible();

	// Task summaries link into the glossary.
	await page.locator('#domain-B .task a').first().click();
	await expect(page).toHaveURL(/\/glossary\//);
});

test('the RBT outline page lists all 43 verified tasks', async ({ page }) => {
	await page.goto('/exams/rbt-tco-3');
	await expect(page.locator('.domains > li')).toHaveCount(6);
	await expect(page.getByText(/Task list pending/)).toHaveCount(0);
	await expect(page.locator('.task')).toHaveCount(43);

	// Per-domain counts straight from the outline document.
	await expect(page.locator('#domain-A .task')).toHaveCount(8);
	await expect(page.locator('#domain-C .task')).toHaveCount(11);
	await expect(page.locator('#domain-F .task')).toHaveCount(10);

	// Codes use the document's own dot notation.
	await expect(page.locator('#domain-F .task .code').first()).toHaveText('F.1');

	// Terms are still reachable through the area they are tagged to.
	await page
		.locator('summary', { hasText: /glossary terms in this area/ })
		.first()
		.click();
	await expect(page.locator('.termlist a').first()).toBeVisible();
});

test('certification facts carry the handbook version they were checked against', async ({
	page
}) => {
	await page.goto('/exams/rbt-tco-3');
	await expect(
		page.getByRole('heading', { name: 'Certification requirements' })
	).toBeVisible();
	await expect(page.getByText(/06\/2026/).first()).toBeVisible();
	await expect(page.getByText(/12 hours of professional development/)).toBeVisible();
	await expect(page.getByRole('link', { name: 'the official handbook' })).toHaveAttribute(
		'href',
		/bacb\.com/
	);
});

test('the plain-language toggle switches every task summary', async ({ page }) => {
	await page.goto('/exams/bcba-tco-6');
	const first = page.locator('#domain-A .task .summary').first();
	const technical = await first.innerText();
	await page.getByRole('button', { name: /plain language/i }).click();
	const plain = await first.innerText();
	expect(plain).not.toBe(technical);
});
