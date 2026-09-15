import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './utils/a11y';

/**
 * The graphs.
 *
 * Three properties are worth asserting rather than eyeballing. A picture must not be the
 * only way to get the content, so every graph carries a description and a table of the
 * numbers. The data path must not cross a phase-change line, because a line drawn across
 * one asserts a continuity the change interrupted — a false claim that looks like a
 * rendering detail. And a staggered design must be drawn as separate tiers, since a
 * single frame with three sets of phase lines says the opposite of what it shows.
 */

test('the index lists every graph and says the data are invented', async ({ page }) => {
	await page.goto('/graphs');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reading graphs');
	await expect(page.getByRole('link', { name: 'The parts of a line graph' })).toBeVisible();
	await expect(
		page.getByRole('link', { name: 'A reversal design, and what it shows' })
	).toBeVisible();
	await expect(page.getByText('Every graph here is invented')).toBeVisible();
	// Six figures, each rendered rather than described in a caption alone.
	expect(await page.locator('figure svg.frame').count()).toBeGreaterThanOrEqual(6);
});

test('a graph is reachable without seeing it: description and numbers', async ({ page }) => {
	await page.goto('/graphs/reading-a-change-in-level');

	const svg = page.locator('svg.frame').first();
	await expect(svg).toHaveAttribute('role', 'img');

	// The accessible description is the long description, wired by reference.
	const describedBy = await svg.getAttribute('aria-describedby');
	expect(describedBy).toBeTruthy();
	await expect(page.locator(`#${describedBy}`)).toContainText('Baseline');
	await expect(page.locator(`#${describedBy}`)).toContainText('Intervention');

	await page.getByRole('group').getByText('The numbers behind this graph').click();
	const table = page.locator('table').first();
	await expect(table).toBeVisible();
	await expect(table.locator('thead th')).toHaveText([
		'Session',
		'Talk-outs per 30 minutes',
		'Condition'
	]);
	// Sixteen sessions, each with its condition named.
	await expect(table.locator('tbody tr')).toHaveCount(16);
	await expect(table.locator('tbody tr').first()).toContainText('Baseline');
	await expect(table.locator('tbody tr').last()).toContainText('Intervention');
});

test('the data path is broken at every phase change', async ({ page }) => {
	await page.goto('/graphs/a-reversal-design');
	// Four conditions, so four separate paths and three phase-change lines. A single path
	// would mean the renderer drew straight through them.
	await expect(page.locator('svg.frame .series .path')).toHaveCount(4);
	await expect(page.locator('svg.frame .phase-lines line')).toHaveCount(3);
});

test('a multiple baseline is drawn as staggered tiers, not one frame', async ({ page }) => {
	await page.goto('/graphs/a-multiple-baseline-across-behaviours');

	const frames = page.locator('svg.frame');
	await expect(frames).toHaveCount(3);
	// One phase line per tier: each change applies to its own behaviour and no other.
	for (let i = 0; i < 3; i++) {
		await expect(frames.nth(i).locator('.phase-lines line')).toHaveCount(1);
	}

	// And the tiers change at different points, which is the whole argument.
	const xs = await frames
		.locator('.phase-lines line')
		.evaluateAll((els) => els.map((el) => Number(el.getAttribute('x1'))));
	expect(new Set(xs).size).toBe(3);
});

test('the anatomy page labels the parts and links them to the glossary', async ({ page }) => {
	await page.goto('/graphs/anatomy-of-a-line-graph');
	await expect(page.getByRole('heading', { name: 'The parts, one at a time' })).toBeVisible();
	for (const label of [
		'Vertical axis',
		'Horizontal axis',
		'Data point',
		'Data path',
		'Phase-change line',
		'Condition label'
	]) {
		await expect(
			page.getByRole('definition').or(page.locator('dt')).filter({ hasText: label }).first()
		).toBeVisible();
	}
	// Two links reach the same term — the callout and the term list at the foot.
	await page.getByRole('link', { name: 'Phase Change Line' }).first().click();
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Phase Change Line');
});

test('a glossary term links back to a graph that shows it', async ({ page }) => {
	await page.goto('/glossary/trend');
	await expect(page.getByRole('heading', { name: 'Shown on a graph' })).toBeVisible();
	await page.getByRole('link', { name: 'A baseline that is already improving' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'A baseline that is already improving'
	);
});

test('search finds a graph by what it teaches', async ({ page }) => {
	await page.goto('/');
	await page.getByLabel('Search terms').fill('multiple baseline');
	// The index loads on first use, so the handover only happens once something is typed.
	await expect(page.locator('[data-search-status="ready"]')).toBeAttached({ timeout: 30_000 });
	const hit = page.locator('.results a', { hasText: 'A multiple baseline across behaviours' });
	await expect(hit).toBeVisible();
	await hit.click();
	await expect(page.getByRole('heading', { level: 1 })).toContainText('multiple baseline');
});

test('the graphs have no accessibility violations with the table open', async ({ page }) => {
	await page.goto('/graphs/a-multiple-baseline-across-behaviours');
	await page.getByText('The numbers behind this graph').click();
	await expect(page.locator('table').first()).toBeVisible();
	await expectNoA11yViolations(page);
});
