import { expect, test, type Page } from '@playwright/test';

/**
 * The band, and the scarcity that makes it mean something.
 *
 * Signal has three levels of loud: a filled band says what kind of page this is, a rule
 * and a label introduce a section, a left border marks an item. The claim the whole theme
 * rests on is that the top level is rare — a solid red bar appears only where the app
 * refuses to give a procedure. A second red bar somewhere ordinary would not look broken,
 * which is exactly why it needs a test rather than an eye.
 */
const band = (page: Page) => page.locator('.band');
const urgent = (page: Page) => page.locator('.band[data-tone="urgent"]');

test('an escalation card arrives under the urgent band', async ({ page }) => {
	await page.goto('/scenarios/learner-is-injuring-themselves');
	await expect(urgent(page)).toHaveCount(1);
	/*
	 * "Urgent" rather than the refusal sentence below it. The band names the kind of page,
	 * the note states what the app will not do, and when the band repeated the sentence a
	 * screen reader read it twice before the heading — which is how this was found.
	 */
	await expect(urgent(page)).toContainText(/urgent/i);
});

test('the escalation route itself carries it too', async ({ page }) => {
	await page.goto('/help');
	await expect(urgent(page)).toHaveCount(1);
});

test('an ordinary page never draws the urgent band', async ({ page }) => {
	/*
	 * A guidance scenario is the case that matters: it is a situation card like the
	 * escalation ones, sits in the same list, and differs only in that this app is allowed
	 * to describe what the plan usually asks for. If the tone were driven by anything
	 * looser than `kind`, this is where it would leak.
	 */
	for (const route of [
		'/glossary/negative-reinforcement',
		'/scenarios/you-are-asked-to-work-outside-your-role'
	]) {
		await page.goto(route);
		await expect(band(page), `${route} should still be banded`).toHaveCount(1);
		await expect(urgent(page), `${route} must not claim urgency`).toHaveCount(0);
	}
});

test('the band says its kind in words, not only in colour', async ({ page }) => {
	// Greyscale, forced colours, and anyone who reads two shades of red as one shade.
	await page.goto('/glossary/negative-reinforcement');
	await expect(band(page)).toContainText(/term/i);
});

test('a section header is a rule, never a fill', async ({ page }) => {
	/*
	 * Level two has to stay quieter than level one. A section header that acquired a
	 * background would flatten the hierarchy into "everything is a band", which is the
	 * failure this arrangement was designed against.
	 */
	await page.goto('/glossary/negative-reinforcement');
	const head = page.locator('.section-head').first();
	await expect(head).toBeVisible();

	const { background, borderTop } = await head.evaluate((el) => {
		const s = getComputedStyle(el);
		return { background: s.backgroundColor, borderTop: parseFloat(s.borderTopWidth) };
	});
	expect(background, 'a section header must not be filled').toMatch(
		/rgba\(0, 0, 0, 0\)|transparent/
	);
	expect(borderTop, 'a section header is introduced by its rule').toBeGreaterThanOrEqual(2);
});

test('the band is legible in dark mode as well as light', async ({ page }) => {
	await page.goto('/scenarios/learner-is-injuring-themselves');
	for (const theme of ['light', 'dark']) {
		await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
		const { fg, bg } = await urgent(page).evaluate((el) => {
			const s = getComputedStyle(el);
			return { fg: s.color, bg: s.backgroundColor };
		});
		expect(fg, `${theme}: the band needs its own text colour`).not.toBe(bg);
		// Measured in the unit tests; here it only has to be painted, not transparent.
		expect(bg, `${theme}: the urgent band stays a solid fill`).not.toMatch(
			/rgba\(0, 0, 0, 0\)/
		);
	}
});
