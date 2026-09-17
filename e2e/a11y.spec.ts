import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './utils/a11y';
import { ROUTES } from './utils/routes';

/*
 * The matrix: route × theme × width. States matter as much as initial paint, so the
 * search-with-results and plain-language-on states are scanned too.
 */
for (const route of ROUTES) {
	test(`${route} has no axe violations (light)`, async ({ page }) => {
		await page.goto(route);
		await expectNoA11yViolations(page);
	});

	test(`${route} has no axe violations (dark)`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.goto(route);
		await expectNoA11yViolations(page);
	});

	test(`${route} has no axe violations at 320px`, async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 720 });
		await page.goto(route);
		await expectNoA11yViolations(page);
	});
}

test('search results state is accessible', async ({ page }) => {
	await page.goto('/');
	await page.getByLabel('Search terms').fill('reinforcement');
	await expect(page.getByRole('link', { name: /Negative Reinforcement/ })).toBeVisible();
	await expectNoA11yViolations(page);
});

test('plain-language state is accessible', async ({ page }) => {
	await page.goto('/glossary/negative-reinforcement');
	await page.getByRole('button', { name: /plain language/i }).click();
	await expectNoA11yViolations(page);
});

test('a flashcard mid-session, revealed, is accessible', async ({ page }) => {
	await page.goto('/study');
	await page.getByRole('button', { name: 'Start' }).click();
	await page.getByRole('button', { name: 'Show answer' }).click();
	await expect(page.getByRole('group', { name: /How well did you know it/ })).toBeVisible();
	await expectNoA11yViolations(page);
});

test('a recall card, written and checked, is accessible', async ({ page }) => {
	// A different shape from the card above: a labelled textarea before the reveal, and the
	// reader's own words beside the answer after it.
	await page.goto('/study');
	await page.getByRole('checkbox', { name: /Write it before you check/ }).check();
	await page.getByRole('button', { name: 'Start' }).click();
	await page.getByLabel(/Write the definition/).fill('An attempt at the definition');
	await page.getByRole('button', { name: 'Check it' }).click();
	await expect(page.locator('.compare .mine')).toBeVisible();
	await expectNoA11yViolations(page);
});

test('a quiz question and its feedback are accessible', async ({ page }) => {
	await page.goto('/quiz');
	await page.getByLabel('Number of questions').selectOption('5');
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('.progress')).toContainText('Question 1 of 5');
	await expectNoA11yViolations(page);
	await page.getByRole('radio').first().check();
	await page.getByRole('button', { name: 'Check answer' }).click();
	await expect(page.getByRole('region', { name: 'Explanation' })).toBeVisible();
	await expectNoA11yViolations(page);
});

test('the glossary with a filter applied is accessible', async ({ page }) => {
	await page.goto('/glossary');
	await page.getByLabel('Exam').selectOption('BCBA');
	await page.getByLabel('Domain').selectOption('G');
	await expectNoA11yViolations(page);
});

test('every route has a unique, non-empty title', async ({ page }) => {
	// SvelteKit announces document.title to screen readers on client-side navigation, so a
	// missing or duplicated title is an accessibility bug, not just an SEO one.
	const titles = new Map<string, string>();
	for (const route of ROUTES) {
		await page.goto(route);
		/*
		 * Wait for a title rather than sampling one. Term and ethics topic pages are
		 * deliberately kept out of the precache, so once the service worker is active it
		 * answers them from the SPA fallback — and that shell carries no <title> of its own
		 * until hydration sets it. Sampling immediately made this test depend on how far
		 * down the route list the worker happened to activate.
		 */
		await expect(page).toHaveTitle(/\S/);
		const title = await page.title();
		expect(title.trim(), `${route} has an empty title`).not.toBe('');
		for (const [other, seen] of titles) {
			expect(title, `${route} duplicates the title of ${other}`).not.toBe(seen);
		}
		titles.set(route, title);
	}
});

test('no horizontal scrolling at 320px', async ({ page }) => {
	// WCAG 1.4.10 Reflow.
	await page.setViewportSize({ width: 320, height: 720 });
	for (const route of ROUTES) {
		await page.goto(route);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow, `${route} scrolls horizontally at 320px`).toBeLessThanOrEqual(1);
	}
});

test('interactive targets meet the 24px minimum', async ({ page }) => {
	// WCAG 2.2 2.5.8. The app targets 44px; this asserts the standard's floor so a
	// regression is caught even if a component opts out of the shared sizing.
	await page.goto('/');
	const small = await page.evaluate(() => {
		const out: string[] = [];
		for (const el of document.querySelectorAll('a, button, input, select, summary')) {
			const r = el.getBoundingClientRect();
			if (r.width === 0 && r.height === 0) continue; // visually hidden (e.g. skip link)
			if (r.width < 24 || r.height < 24) {
				out.push(
					`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`
				);
			}
		}
		return out;
	});
	expect(small).toEqual([]);
});

test('a simulation in progress, with its clock and navigator, is accessible', async ({
	page
}) => {
	await page.goto('/quiz');
	await page.getByLabel('Full exam simulation, against the clock').check();
	await page.getByRole('button', { name: 'Start the clock' }).click();
	await page.getByRole('button', { name: 'Flag for review' }).click();
	await expect(page.getByRole('timer')).toBeVisible();
	await expectNoA11yViolations(page);
});
