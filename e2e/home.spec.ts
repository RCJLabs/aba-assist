import { expect, test, type Page } from '@playwright/test';

/**
 * The home page.
 *
 * Two properties matter more than the layout. Search has to stay one tap away and above
 * the fold on a phone — this is the app somebody opens one-handed in a hallway, and a
 * redesign that buries the search field costs the app its primary use. And the mode has
 * to mean one thing: picking Analyst here and then finding the tracker still checking a
 * technician's requirements would make the switch decoration.
 */

/*
 * Located by accessible name, not by the visible code: each chip shows "RBT" or "All" but
 * announces the full role, which is the name a screen reader reads out and therefore the
 * one worth asserting against.
 */
const mode = (page: Page, name: RegExp) =>
	page.getByRole('group', { name: 'Show content for' }).getByRole('radio', { name });

test('search is above the fold on a phone, under the mode switch', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');

	const field = page.getByLabel('Search terms');
	await expect(field).toBeInViewport();

	// And the mode sits above it, which is the order that was asked for.
	const modes = page.getByRole('group', { name: 'Show content for' });
	const modeBox = await modes.boundingBox();
	const fieldBox = await field.boundingBox();
	expect(modeBox!.y).toBeLessThan(fieldBox!.y);
});

test('the mode switch is one row of four, even at 320px', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 800 });
	await page.goto('/');

	const chips = page.getByRole('group', { name: 'Show content for' }).getByRole('radio');
	await expect(chips).toHaveCount(4);
	const tops = await page
		.locator('.chip')
		.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
	expect(new Set(tops).size, 'all four chips share a row').toBe(1);
});

test('picking a mode filters the glossary and follows to the tracker', async ({ page }) => {
	await page.goto('/');
	await mode(page, /Behavior analyst \(BCBA\)/)
		.first()
		.check();

	// The content filter followed.
	await page.goto('/glossary');
	await expect(page.getByLabel('Exam', { exact: true })).toHaveValue('BCBA');

	/*
	 * And so did the tracker, which keeps its own credential. This is the half that was
	 * missing: two independent states meant the mode only appeared to apply everywhere.
	 */
	await page.goto('/tools');
	await expect(page.locator('[data-tracker-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
	await expect(page.getByLabel('Track requirements for')).toHaveValue('BCBA');
});

test('choosing Everything leaves the tracker alone rather than resetting it', async ({
	page
}) => {
	await page.goto('/');
	await mode(page, /Technician \(RBT\)/)
		.first()
		.check();
	await page.goto('/tools');
	await expect(page.locator('[data-tracker-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
	await page.getByLabel('Track requirements for').selectOption('BCaBA');

	await page.goto('/');
	await mode(page, /Everything, with no filter/)
		.first()
		.check();

	await page.goto('/tools');
	await expect(page.locator('[data-tracker-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
	// The tracker has to be checking somebody's requirements; "everything" is not one.
	await expect(page.getByLabel('Track requirements for')).toHaveValue('BCaBA');
});

test('the mode survives a reload', async ({ page }) => {
	await page.goto('/');
	await mode(page, /Assistant behavior analyst/)
		.first()
		.check();
	await page.reload();
	await expect(mode(page, /Assistant behavior analyst/).first()).toBeChecked();
});

test('destinations are grouped rather than piled into one list', async ({ page }) => {
	await page.goto('/');
	for (const heading of ['Look something up', 'Study for the exam', 'On the job']) {
		await expect(page.getByRole('heading', { name: heading })).toBeVisible();
	}
	// The urgent card stays out of the groups and above them.
	const urgent = page.locator('a.tile.stop');
	await expect(urgent).toBeVisible();
	const urgentBox = await urgent.boundingBox();
	const firstGroup = await page
		.getByRole('heading', { name: 'Look something up' })
		.boundingBox();
	expect(urgentBox!.y).toBeLessThan(firstGroup!.y);
});

test('the page is complete with no stored data, and the strip stays away', async ({
	page
}) => {
	await page.goto('/');
	// Nothing personal is shown to somebody with no history — which is also what a search
	// engine sees.
	await expect(page.locator('.strip')).toHaveCount(0);
	await expect(page.getByRole('link', { name: /Glossary/ })).toBeVisible();
});
