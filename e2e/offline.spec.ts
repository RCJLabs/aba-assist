import { expect, test, type Page } from '@playwright/test';

/**
 * Offline is the core promise of this app — clinics and schools have unreliable WiFi, and
 * the reason to install it at all is that it keeps working without a signal.
 *
 * It went untested through several milestones, and three separate bugs hid in that gap:
 * the service worker never activated (precache requests were being redirected), the
 * navigation fallback pointed at a URL outside the precache, and the fallback page was
 * never added to the precache at all. Each one silently disabled offline while every
 * other test stayed green.
 *
 * Runs in a dedicated serial file because a service worker is per-origin state.
 */
test.describe.configure({ mode: 'serial' });

async function installServiceWorker(page: Page): Promise<string> {
	await page.goto('/');
	const state = await page.evaluate(
		() =>
			Promise.race([
				navigator.serviceWorker.ready.then(() => 'active'),
				new Promise<string>((r) => setTimeout(() => r('timeout'), 20_000))
			]) as Promise<string>
	);
	// A second load so the worker is controlling the page.
	await page.reload();
	await page.waitForTimeout(500);
	return state;
}

test('the service worker activates and takes control', async ({ page }) => {
	expect(await installServiceWorker(page)).toBe('active');
	expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
});

test('every main route still opens with no network', async ({ page, context }) => {
	expect(await installServiceWorker(page)).toBe('active');
	await context.setOffline(true);

	const routes: [string, RegExp][] = [
		['/glossary', /Glossary/],
		['/scenarios', /Situations/],
		['/help', /urgent/i],
		['/settings', /Settings/],
		['/about', /About this app/],
		['/study', /Flashcards/],
		['/quiz', /Practice questions/],
		['/exams', /Exams and certifications/],
		['/ethics', /Ethics/],
		// The tracker is the one part of this app somebody opens in a building with no
		// signal, so it is precached rather than excluded like the per-term pages.
		['/tools', /Tools/],
		['/tools/supervision', /Supervision log/],
		['/tools/development', /Professional development/],
		['/tools/notes', /Writing session notes/]
	];

	for (const [path, heading] of routes) {
		await page.goto(path);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
	}

	await context.setOffline(false);
});

test('a deep link to a term page works offline and shows that term', async ({
	page,
	context
}) => {
	expect(await installServiceWorker(page)).toBe('active');
	await context.setOffline(true);

	// Term pages are deliberately excluded from the precache, so this exercises the
	// navigation fallback. The earlier bug rendered the home page here instead, which is
	// worse than an error: it looks like the app worked and quietly shows the wrong thing.
	await page.goto('/glossary/extinction');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Extinction');
	await expect(page.getByText(/reinforcement that has maintained/i)).toBeVisible();

	await page.goto('/scenarios/learner-is-injuring-themselves');
	await expect(page.getByText(/Stop and escalate/i)).toBeVisible();

	// The outline pages are precached: they are two documents, not hundreds.
	await page.goto('/exams/bcba-tco-6');
	await expect(page.locator('.task')).toHaveCount(104);

	// Ethics topic pages are excluded from the precache like term pages, so this
	// exercises the navigation fallback rendering from the precached JSON.
	await page.goto('/ethics/gifts');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Gifts/);

	await context.setOffline(false);
});

test('flashcards and the quiz work with no network', async ({ page, context }) => {
	expect(await installServiceWorker(page)).toBe('active');
	await context.setOffline(true);

	await page.goto('/study');
	await page.getByRole('button', { name: 'Start' }).click();
	await page.getByRole('button', { name: 'Show answer' }).click();
	await expect(page.getByRole('group', { name: /How well did you know it/ })).toBeVisible();

	await page.goto('/quiz');
	await page.getByLabel('Number of questions').selectOption('5');
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('.progress')).toContainText('Question 1 of 5');

	await context.setOffline(false);
});

test('search still works offline', async ({ page, context }) => {
	expect(await installServiceWorker(page)).toBe('active');
	await context.setOffline(true);

	await page.goto('/');
	await page.getByLabel('Search terms').fill('extinction');
	await expect(page.getByRole('link', { name: /Extinction/ }).first()).toBeVisible();

	// The fuzzy index is precached too, so it must still take over with no network.
	await expect(page.locator('form[role="search"]')).toHaveAttribute(
		'data-search-status',
		'ready',
		{ timeout: 20_000 }
	);

	await context.setOffline(false);
});
