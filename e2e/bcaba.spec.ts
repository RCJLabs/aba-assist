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

test('the quiz runs the assistant bank, filed against the assistant outline', async ({
	page
}) => {
	await setMode(page);
	await page.goto('/quiz');

	await expect(page.getByLabel('Exam', { exact: true })).toHaveValue('BCaBA');
	// No silent swap to another credential's bank; that note is for exams with none.
	await expect(page.locator('[data-bankless]')).toHaveCount(0);

	// The area list is the assistant outline's, including the two areas it names differently.
	const area = page.getByLabel('Content area');
	await expect(area).toContainText('Intervention Development and Monitoring');
	await expect(area).not.toContainText('Personnel Supervision and Management');

	await area.selectOption('I');
	await page.getByLabel('Number of questions').selectOption('5');
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('.progress')).toContainText('Question 1 of 5');
});

/*
 * This test used to assert the opposite, and it was passing for the wrong reason.
 *
 * The assistant outline publishes question counts but not the clock, so the quiz refused
 * to offer a simulation rather than invent a pace. That was right, and the test checked
 * it with `toHaveCount(0)` — which is satisfied instantly, before `previewPlan()` has
 * resolved. It would have gone on passing whatever the page did. The replacement waits
 * for the option and reads the figures off it, so it cannot pass by being early.
 *
 * The handbook has now been read: four hours for all 175 questions. Both analyst papers
 * run to 240 minutes, so the clock alone cannot tell them apart — the item count is the
 * discriminator, and that is what this asserts.
 */
test('the assistant exam is paced from its own handbook, not the analyst one', async ({
	page
}) => {
	await setMode(page);
	await page.goto('/quiz');

	const simulation = page.getByRole('radio', { name: /Full exam simulation/ });
	await expect(simulation).toBeVisible();
	await simulation.check();

	// 150 scored plus 25 unscored, four hours: the assistant paper, not the analyst's 185.
	await expect(page.locator('.setup')).toContainText('175 questions in 240 minutes');
	await expect(page.locator('.setup')).not.toContainText('185 questions');
	await expect(page.locator('[data-no-simulation]')).toHaveCount(0);
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
	 * The requirement used to be withheld, because the assistant handbook had not been
	 * read and borrowing the analyst's 32 units would have been a figure nobody checked.
	 * The handbook has been read, so the numbers are now the assistant's own — and the
	 * analyst's must still never appear here, which is the half of this that never
	 * expires.
	 */
	/*
	 * Scoped to the card and compared with `toContainText`, which normalises whitespace.
	 * A bare `getByText` compares against text that still carries the line breaks the
	 * template's `{#if}` boundaries leave behind, so "including 4 on ethics" is not found
	 * even though that is exactly what a reader sees.
	 */
	const cards = page.locator('.cards');
	await expect(cards).toContainText('20 CEUs every 2 years, including 4 on ethics');
	await expect(cards).not.toContainText('32 CEUs');
	await expect(cards).not.toContainText('have not been read into the app yet');

	/*
	 * The supervision percentage steps down with experience and the app cannot know which
	 * tier applies, so the card must say both rather than presenting the upper figure as
	 * the whole rule.
	 */
	await expect(cards).toContainText(
		'5% of the hours you deliver each month for your first 1,000 hours of practice, then 2%'
	);
	// One contact a month, in the singular.
	await expect(cards).toContainText('with 1 real-time contact.');

	await page.goto('/tools/development');
	await expect(page.getByRole('heading', { name: 'Set up your cycle' })).toBeVisible();
});

test('the assistant mode is accessible', async ({ page }) => {
	await setMode(page);
	await page.goto('/exams/bcaba-tco-6');
	const { expectNoA11yViolations } = await import('./utils/a11y');
	await expectNoA11yViolations(page);
});

test('a slow bank for the exam you left cannot zero the count for the one you picked', async ({
	page
}) => {
	/*
	 * A regression test for a bug that only appeared under load.
	 *
	 * `countAvailable` reads the exam off the state, awaits that exam's bank, and then
	 * writes a count — so a load started for one exam can land after the reader has moved
	 * to another. The sequence is the ordinary one: the prerendered form ships with the
	 * technician exam selected and hydration counts against it, then the saved filter
	 * switches to the assistant exam a moment later. Pick area I, which the technician
	 * outline does not have, and the late technician answer filtered to zero: "0 questions
	 * available" and a dead Start button over a bank of twenty-one.
	 *
	 * The ordering is forced rather than waited for. The technician bank is held back long
	 * enough to guarantee it lands last, which is what a slow phone did by itself.
	 */
	await page.route('**/_app/immutable/**/*.js', async (route) => {
		const response = await route.fetch();
		const body = await response.text();
		// Matched on a question id only the technician bank carries, rather than on the
		// hashed chunk name or on anything every bank shares.
		if (body.includes('rbt-a-count-needs-time-to-compare')) {
			await new Promise((r) => setTimeout(r, 2500));
		}
		await route.fulfill({ response, body });
	});

	await setMode(page);
	// `commit` rather than `load`: waiting for the page to settle would wait for the very
	// chunk being held, and there would be no race left to test.
	await page.goto('/quiz', { waitUntil: 'commit' });

	const area = page.getByLabel('Content area');
	await area.selectOption('I');
	await page.getByLabel('Number of questions').selectOption('5');

	// The assistant bank's area I, and it has to stay there once the held bank lands.
	await expect(page.locator('.setup')).toContainText(/21\s+questions available/, {
		timeout: 20_000
	});
	await page.waitForTimeout(3000);
	await expect(page.locator('.setup')).toContainText(/21\s+questions available/);

	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('.progress')).toContainText('Question 1 of 5');
});
