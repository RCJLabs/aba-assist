import { expect, test, type Page } from '@playwright/test';

/**
 * Session mode.
 *
 * The promise is narrow and worth testing precisely: while a session is running, looking
 * something up must not cost you the session. Everything else on this page exists to
 * serve that — the clock stays on screen, definitions open in place, and nothing is
 * stored, because a counting aid that quietly became a record would be the one thing this
 * app must never do.
 */

/*
 * The disclosures are located as elements rather than by role: Chromium does not expose
 * <summary> as a button here, and the native disclosure is the right control regardless —
 * axe is happy with it and it works without script.
 */
async function startSession(page: Page): Promise<void> {
	await page.goto('/session');
	await page.getByLabel('Interval', { exact: true }).selectOption('10');
	await page.getByLabel('Length', { exact: true }).selectOption('5');
	await page.getByRole('button', { name: 'Start the session' }).click();
	await expect(page.locator('[data-session-status="running"]')).toBeAttached();
}

test('runs an interval session and tallies what was scored', async ({ page }) => {
	await startSession(page);
	await expect(page.getByRole('timer')).toBeVisible();

	await page.getByRole('button', { name: 'Yes', exact: true }).click();
	await expect(page.locator('.tally')).toContainText('1 of 30 scored');
	await expect(page.locator('.tally')).toContainText('100%');
});

test('shows no percentage until something has been scored', async ({ page }) => {
	// Nought out of nought is not nought percent, and this app does not invent figures.
	await startSession(page);
	await expect(page.locator('.tally')).toContainText('0 of 30 scored');
	await expect(page.locator('.tally strong')).toHaveText('—');
});

test('a lookup answers in place and the clock keeps running', async ({ page }) => {
	await startSession(page);
	await page.locator('summary', { hasText: 'Look something up' }).click();
	await page.getByLabel('Find a term').fill('motiv');

	const hit = page.locator('.hits li').first();
	await expect(hit).toContainText('Motivating Operation');
	await hit.getByRole('button').click();

	// The plain definition arrives without leaving the page.
	await expect(hit.locator('.detail p').first()).not.toBeEmpty();
	await expect(page).toHaveURL(/\/session$/);
	// And the session is still the session: same page, same clock, tally intact.
	await expect(page.locator('[data-session-status="running"]')).toBeAttached();
	await expect(page.getByRole('timer')).toBeVisible();
});

test('a term is reachable by the abbreviation somebody just said', async ({ page }) => {
	await startSession(page);
	await page.locator('summary', { hasText: 'Look something up' }).click();
	await page.getByLabel('Find a term').fill('DRO');
	await expect(page.locator('.hits li').first()).toContainText(
		'Differential Reinforcement of Other Behavior'
	);
});

test('does not offer a way out of a running session', async ({ page }) => {
	/*
	 * A link to the full entry would stop the clock and lose the tally, so it is offered
	 * only once the clock is not running. This is the whole point of the page.
	 */
	await startSession(page);
	await page.locator('summary', { hasText: 'Look something up' }).click();
	await page.getByLabel('Find a term').fill('motiv');
	const hit = page.locator('.hits li').first();
	await hit.getByRole('button').click();
	await expect(hit.locator('.detail p').first()).not.toBeEmpty();
	await expect(hit.getByRole('link', { name: 'The full entry' })).toHaveCount(0);
	await expect(page.locator('.stays')).toContainText('does not stop the clock');

	await page.getByRole('button', { name: 'Stop' }).click();
	await expect(hit.getByRole('link', { name: 'The full entry' })).toBeVisible();
});

test('the note checklist is scratch paper and says so', async ({ page }) => {
	await startSession(page);
	const note = page.locator('summary', { hasText: 'The note' });
	await note.click();
	await expect(page.locator('.scratch')).toContainText('Nothing here is saved');

	const first = page.locator('.items input').first();
	await first.check();
	await expect(note).toContainText('1 of');
});

test('leaving the page ends the session rather than leaving a clock running', async ({
	page
}) => {
	await startSession(page);
	await page.goto('/tools');
	await page.goto('/session');
	// Back at setup: a cue firing into an empty room would be worse than losing a tally.
	await expect(page.getByRole('heading', { name: 'Session mode' })).toBeVisible();
	await expect(page.locator('[data-session-status="idle"]')).toBeAttached();
});

test('is reachable from home and from tools', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: /Session mode/ }).click();
	await expect(page).toHaveURL(/\/session$/);

	await page.goto('/tools');
	await page.getByRole('link', { name: 'Session mode' }).click();
	await expect(page).toHaveURL(/\/session$/);
});
