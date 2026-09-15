import { expect, test, type Page } from '@playwright/test';

/**
 * The study plan.
 *
 * The property worth holding is the refusal: this page must not turn six answers into a
 * percentage, and must not turn two sampled areas into an overall readiness figure. Those
 * numbers would be the most reassuring thing on the screen and the least supported, which
 * is the exact failure the apps in this market are known for.
 */

async function openPlan(page: Page): Promise<void> {
	await page.goto('/plan');
	await expect(page.locator('[data-plan-status="ready"]')).toBeAttached({ timeout: 30_000 });
}

/** Answer `n` questions in one area, taking the first option every time. */
async function drill(page: Page, domain: string, n: number): Promise<void> {
	await page.goto('/quiz');
	await page.getByLabel('Exam', { exact: true }).selectOption('RBT');
	await page.getByLabel('Content area').selectOption(domain);
	await page.getByLabel('Number of questions').selectOption(String(n));
	await page.getByRole('button', { name: 'Start' }).click();

	for (let i = 1; i <= n; i++) {
		await expect(page.locator('.progress')).toContainText(`Question ${i} of ${n}`);
		await page.getByRole('radio').first().check();
		await page.getByRole('button', { name: 'Check answer' }).click();
		await page.getByRole('button', { name: i < n ? 'Next question' : 'See results' }).click();
	}
	await expect(
		page.getByRole('heading', { name: new RegExp(`of ${n} correct`) })
	).toBeVisible();
}

test('with no history it says so rather than showing an empty score', async ({ page }) => {
	await openPlan(page);
	await expect(page.getByRole('heading', { name: 'Nothing to go on yet' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Start practising' })).toBeVisible();
	// No percentage anywhere: there is nothing to compute one from.
	await expect(page.locator('.bar')).toHaveCount(0);
});

test('a handful of answers is reported as a count, never as a percentage', async ({
	page
}) => {
	await drill(page, 'A', 5);
	await openPlan(page);

	const area = page.locator('.areas li').first();
	await expect(area).toHaveAttribute('data-measured', 'false');
	await expect(area).toContainText('more before this app will state a percentage');
	// The action for an unmeasured area is to answer more, not to drill blindly.
	await expect(page.locator('.actions')).toContainText('Answer');
});

test('no overall figure is given while any area is unsampled', async ({ page }) => {
	await drill(page, 'A', 5);
	await openPlan(page);
	await expect(page.locator('.summary')).toContainText('areas');
	await expect(page.locator('.summary')).toContainText('no overall figure');
	// And the caveat is present whatever the numbers say.
	await expect(page.locator('.caveat')).toContainText('not a probability of passing');
});

test('the plan links each action to the thing that does it', async ({ page }) => {
	await drill(page, 'A', 5);
	await openPlan(page);

	await page.locator('.actions li').first().getByRole('button').click();
	// Whichever action ranked first, it lands somewhere you can act.
	await expect(page).toHaveURL(/\/(quiz|study)$/);
});

test('quiz results offer the plan rather than leaving a table of percentages', async ({
	page
}) => {
	await drill(page, 'A', 5);
	const link = page.getByRole('link', { name: 'See what to study next' });
	await expect(link).toBeVisible();
	await link.click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('What to study next');
});

test('the plan is accessible', async ({ page }) => {
	await drill(page, 'A', 5);
	await openPlan(page);
	const { expectNoA11yViolations } = await import('./utils/a11y');
	await expectNoA11yViolations(page);
});
