import { expect, test, type Page } from '@playwright/test';

/**
 * The trackers on paper.
 *
 * Print CSS is the kind of thing that rots silently: nobody opens a print preview during
 * ordinary work, so a rule broken by an unrelated refactor stays broken until somebody
 * needs a document in a meeting. `emulateMedia` makes it ordinary test surface.
 *
 * What is asserted is the difference between an application and a document — the
 * navigation and the controls gone, the record and its provenance stamp present.
 */
const ready = async (page: Page, route: string) => {
	await page.goto(route);
	await expect(page.locator('[data-tracker-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
};

test('printing a tracker drops the app and keeps the record', async ({ page }) => {
	await ready(page, '/tools/supervision');

	// On screen: an application.
	await expect(page.locator('nav[aria-label="Main"]')).toBeVisible();
	await expect(page.locator('.printed').first()).toBeHidden();

	await page.emulateMedia({ media: 'print' });

	// On paper: a document.
	await expect(page.locator('nav[aria-label="Main"]')).toBeHidden();
	await expect(page.locator('header').first()).toBeHidden();
	await expect(page.locator('.printed').first()).toBeVisible();
});

test('the printed page says what it is and when it was run', async ({ page }) => {
	/*
	 * A page of numbers with no title and no date could be anybody's, from any month. A
	 * supervisor filing two of them has no way to tell them apart, which is the difference
	 * between a record and a screenshot.
	 */
	await ready(page, '/tools/supervision');
	await page.emulateMedia({ media: 'print' });

	const stamp = page.locator('.printed').first();
	await expect(stamp).toContainText('Supervision log');
	await expect(stamp).toContainText(/printed/i);
	await expect(stamp).toContainText(String(new Date().getFullYear()));
});

test('no control survives onto the paper', async ({ page }) => {
	/*
	 * A printed "Delete this month" button is the first thing anybody would notice, and the
	 * rule that hides them is global — so it is worth checking on a page dense with them
	 * rather than trusting one selector.
	 */
	await ready(page, '/tools/supervision');
	await page.emulateMedia({ media: 'print' });

	const buttons = page.locator('button');
	const total = await buttons.count();
	expect(total).toBeGreaterThan(0);
	for (let i = 0; i < total; i++) {
		await expect(buttons.nth(i)).toBeHidden();
	}
});

test('the forms go and the record stays', async ({ page }) => {
	await ready(page, '/tools/supervision');
	await page.emulateMedia({ media: 'print' });

	await expect(page.locator('section.record')).toBeVisible();
	const forms = page.locator('form');
	for (let i = 0; i < (await forms.count()); i++) {
		await expect(forms.nth(i)).toBeHidden();
	}
});

/*
 * These two need a record to exist before there is anything to print, and both are set up
 * through one short form. Driven rather than seeded on purpose: the stamp reads its subject
 * off the same state the form writes, so going through the form is what proves the two
 * agree.
 */
test('the development ledger prints once a cycle exists', async ({ page }) => {
	await ready(page, '/tools/development');
	await page.getByLabel('Cycle started').fill('2026-01-15');
	await page.getByRole('button', { name: 'Add cycle' }).click();
	await expect(page.locator('section.record').first()).toBeVisible();

	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('nav[aria-label="Main"]')).toBeHidden();
	const stamp = page.locator('.printed').first();
	await expect(stamp).toBeVisible();
	await expect(stamp).toContainText('Professional development');
});

test('the fieldwork record prints, and names the supervisor by code', async ({ page }) => {
	await ready(page, '/tools/fieldwork');
	await page.getByLabel('First day of fieldwork').fill('2026-02-01');
	await page.getByLabel('Supervisor code').fill('S-04');
	await page.getByRole('button', { name: /Start tracking|Start/ }).click();
	await expect(page.locator('section.record').first()).toBeVisible();

	await page.emulateMedia({ media: 'print' });
	const stamp = page.locator('.printed').first();
	await expect(stamp).toBeVisible();
	// A code, never a name. The one artifact that leaves the device must hold that line.
	await expect(stamp).toContainText('S-04');
});

test('a page that is not a tracker is unharmed by the print rules', async ({ page }) => {
	/*
	 * The chrome rules are global, so they reach every route. A glossary entry printed for
	 * a training folder should still be the entry — the guard is that the body survives,
	 * not just that the navigation goes.
	 */
	await page.goto('/glossary/negative-reinforcement');
	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('h1')).toBeVisible();
	await expect(page.locator('nav[aria-label="Main"]')).toBeHidden();
});
