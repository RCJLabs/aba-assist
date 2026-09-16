import { expect, test, type Page } from '@playwright/test';

/**
 * The assistant-analyst credential, end to end.
 *
 * Until its outline was modelled, choosing BCaBA pointed every filter at the analyst
 * outline and the tracker at the analyst handbook. Both were defensible while there was
 * nothing else to point at, and both were wrong in a way a reader could not see: the two
 * documents number their tasks independently, and the two credentials are not maintained
 * on the same terms. What is tested here is that the app now either uses the assistant
 * document or says it does not have one — never the analyst's, silently.
 */

const setMode = async (page: Page) => {
	await page.goto('/');
	await page
		.getByRole('radio', { name: /Assistant behavior analyst \(BCaBA\)/ })
		.first()
		.check();
};

test('the glossary filters on the assistant outline, with its own areas', async ({ page }) => {
	await setMode(page);

	await page.goto('/glossary');
	await expect(page.getByLabel('Exam', { exact: true })).toHaveValue('BCaBA');

	const shown = await page.locator('section li').count();
	expect(shown, 'the assistant filter is narrower, not empty').toBeGreaterThan(100);

	// The area list comes from the assistant document, which names two areas differently.
	const domain = page.getByLabel('Domain');
	await expect(domain).toContainText('Intervention Development and Monitoring');
	await expect(domain).toContainText('Supervisory Relationships');
	await expect(domain).not.toContainText('Personnel Supervision and Management');

	await domain.selectOption('I');
	const supervision = await page.locator('section li').count();
	expect(supervision).toBeGreaterThan(0);
	expect(supervision).toBeLessThan(shown);
});

test('the quiz says whose bank it is running rather than swapping quietly', async ({
	page
}) => {
	await setMode(page);
	await page.goto('/quiz');

	// No assistant questions are written yet, so the selector cannot offer that exam.
	await expect(page.getByLabel('Exam', { exact: true })).toHaveValue('BCBA');
	await expect(page.locator('[data-bankless="BCaBA"]')).toContainText(
		'No BCaBA questions have been written yet'
	);
});

test('the tracker withholds requirements it has not read instead of borrowing them', async ({
	page
}) => {
	await setMode(page);
	await page.goto('/tools');
	await expect(page.locator('[data-tracker-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
	await expect(page.getByLabel('Track requirements for')).toHaveValue('BCaBA');

	/*
	 * The analyst requirement is 32 units per cycle. Showing that number to an assistant
	 * analyst is the specific bug this replaces: a figure nobody checked for them, in a
	 * tool whose whole value is that the arithmetic is right.
	 */
	await expect(page.getByText('32')).toHaveCount(0);
	await expect(page.getByText(/have not been read into the app yet/)).toBeVisible();

	// And the ledger still records units; it just does not score them against a total.
	await page.goto('/tools/development');
	await expect(page.getByText(/have not been read into the app yet/)).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Set up your cycle' })).toBeVisible();
});

test('the assistant mode is accessible', async ({ page }) => {
	await setMode(page);
	await page.goto('/exams/bcaba-tco-6');
	const { expectNoA11yViolations } = await import('./utils/a11y');
	await expectNoA11yViolations(page);
});
