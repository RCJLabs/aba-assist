import { expect, test, type Page } from '@playwright/test';

/**
 * The cross-fade between pages.
 *
 * What is defended here is the exemption, not the effect. Every page can afford 140ms;
 * the one somebody opens because a learner is hurt cannot, and an animation there is the
 * app hesitating in the one moment it must not.
 */
const countTransitions = async (page: Page) => {
	await page.addInitScript(() => {
		const w = window as unknown as { __vt: number };
		w.__vt = 0;
		const orig = document.startViewTransition?.bind(document);
		if (!orig) return;
		document.startViewTransition = ((cb: () => unknown) => {
			w.__vt += 1;
			return orig(cb);
		}) as typeof document.startViewTransition;
	});
};

const transitions = (page: Page) =>
	page.evaluate(() => (window as unknown as { __vt: number }).__vt);

const navTo = (page: Page, name: string) =>
	page.getByRole('navigation').getByRole('link', { name, exact: true }).click();

/*
 * The suite runs with reduced motion on by default, deliberately — tests should assert on
 * content, never race an animation. That makes the reduced-motion path the one everything
 * else already covers, and means the animated path has to ask for itself here.
 */
test.describe('with motion allowed', () => {
	test.use({ reducedMotion: 'no-preference' });

	test('an ordinary navigation cross-fades', async ({ page }) => {
		await countTransitions(page);
		await page.goto('/');
		// A link click, not a goto: only client-side routing goes through onNavigate.
		await navTo(page, 'Terms');
		await expect(page.getByRole('heading', { level: 1, name: 'Glossary' })).toBeVisible();
		expect(await transitions(page)).toBeGreaterThan(0);
	});

	test('the escalation route never waits on an animation, in either direction', async ({
		page
	}) => {
		await countTransitions(page);
		await page.goto('/');

		await navTo(page, 'Urgent');
		await expect(
			page.getByRole('heading', { level: 1, name: 'Something urgent is happening' })
		).toBeVisible();
		expect(await transitions(page)).toBe(0);

		// And leaving it is exempt too, so the exit is as immediate as the entrance.
		await navTo(page, 'Home');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		expect(await transitions(page)).toBe(0);
	});
});

test('no transition is started when reduced motion is asked for', async ({ page }) => {
	await countTransitions(page);
	await page.goto('/');
	await navTo(page, 'Terms');
	await expect(page.getByRole('heading', { level: 1, name: 'Glossary' })).toBeVisible();
	/*
	 * Stronger than overriding the animation to none: a transition that is never started
	 * cannot be got wrong by a stylesheet loading late or by a pseudo-element the override
	 * does not reach.
	 */
	expect(await transitions(page)).toBe(0);
});

test('navigation still lands the reader at the start of the new page', async ({ page }) => {
	// The transition must not swallow the focus move a screen-reader user depends on.
	await page.goto('/');
	await navTo(page, 'Terms');
	await expect(page.getByRole('heading', { level: 1, name: 'Glossary' })).toBeVisible();
	await expect(page.locator('main')).toBeFocused();
});
