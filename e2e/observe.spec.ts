import { expect, test, type Page } from '@playwright/test';

/**
 * The measurement rehearsal.
 *
 * What the unit tests cannot reach: whether a run actually ends, whether the controls
 * record what the reader did, and whether a sitting reaches the history. The engine's
 * arithmetic is covered in `observe.test.ts` and is not re-checked here.
 *
 * Every run is set to the shortest session at the fastest pace — one minute at four times
 * is fifteen seconds of wall clock. A rehearsal is the one feature in this app whose tests
 * cost real time, so they are few and they are short.
 */

async function setUp(page: Page, method: string) {
	await page.goto('/drills/data');
	await expect(page.locator('[data-observe-status="setup"]')).toBeAttached({
		timeout: 30_000
	});
	await page.getByRole('radio', { name: method }).check();
	await page.getByLabel('Session length').selectOption('60');
	await page.getByLabel('Pace').selectOption('4');
	// Off for the tests: an AudioContext in a headless browser is noise in both senses.
	await page.getByLabel('Sound the interval cue').uncheck();
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('[data-observe-status="running"]')).toBeAttached();
}

test('a run plays out, ends on its own, and reports against the truth', async ({ page }) => {
	await setUp(page, 'Frequency');

	/*
	 * Tap once, whenever, rather than waiting for the stimulus to be mid-episode.
	 *
	 * That wait was a race the poller can lose outright: at four times pace the whole
	 * sixty-second run is about fifteen real seconds, and an episode can be under one of
	 * them, so "visible at some poll" is not guaranteed however long the timeout. It also
	 * was not testing what this test is named for — that the run ends on its own and is
	 * scored against the truth — and the engine's episode generation has unit tests of its
	 * own that do not depend on catching a frame.
	 */
	await page.getByRole('button', { name: 'Count it' }).click();
	await expect(page.locator('[data-observe-status="done"]')).toBeAttached({ timeout: 30_000 });

	// One tap against however many occurrences there were: a real figure, not a fixed one.
	await expect(page.locator('.figures')).toContainText('1');
	await expect(page.locator('[data-agreement]')).toBeVisible();
});

test('the same session can be run again on another method', async ({ page }) => {
	/*
	 * The feature the whole design is built around. Two methods over one stretch of time is
	 * the only way the disagreement between them is a fact about the methods rather than a
	 * fact about two different sessions.
	 */
	await setUp(page, 'Partial interval');
	await expect(page.locator('[data-observe-status="done"]')).toBeAttached({ timeout: 30_000 });
	// The figures, not the whole table: the badge marking which method was used moves, which
	// is the one thing that is supposed to differ between the two runs.
	const figures = await page.locator('.compare td').allInnerTexts();

	await page.getByRole('button', { name: 'Same session, another method' }).click();
	await expect(page.locator('[data-observe-status="setup"]')).toBeAttached();
	await expect(page.locator('.note')).toContainText(/same session/i);

	await page.getByRole('radio', { name: 'Whole interval' }).check();
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('[data-observe-status="done"]')).toBeAttached({ timeout: 30_000 });

	// Same stream, so what every method would report is unchanged.
	expect(await page.locator('.compare td').allInnerTexts()).toEqual(figures);
});

test('the interval control can be worked from the keyboard alone', async ({ page }) => {
	await setUp(page, 'Momentary time sampling');
	await page.locator('h1').click();
	await page.keyboard.press(' ');
	await expect(page.getByRole('button', { name: /^Marked/ })).toBeVisible();
	await page.keyboard.press(' ');
	await expect(page.getByRole('button', { name: /^Mark this interval/ })).toBeVisible();
});

test('a stopped run is scored against what it got through, not the whole session', async ({
	page
}) => {
	await setUp(page, 'Frequency');
	await page.getByRole('button', { name: 'Stop and score it' }).click();
	await expect(page.locator('[data-observe-status="done"]')).toBeAttached();
	// Ten seconds of a sixty-second stream can only hold so much.
	const truth = Number(await page.locator('.figures dd').nth(1).innerText());
	expect(truth).toBeLessThan(6);
});

test('a finished sitting reaches the progress page, and stays out of the pair figures', async ({
	page
}) => {
	await setUp(page, 'Duration');
	await expect(page.locator('[data-observe-status="done"]')).toBeAttached({ timeout: 30_000 });
	// Wait for the write, not for the score: the summary renders before it lands.
	await expect(page.locator('[data-sitting="saved"]')).toBeVisible({ timeout: 10_000 });

	await page.goto('/progress');
	await expect(page.locator('[data-progress-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
	await expect(page.locator('body')).toContainText(/mean agreement across 1\s+sitting/i);
	await expect(page.locator('body')).toContainText('Duration');
	/*
	 * The reason the two kinds are filtered apart. One store, two measurements: a pair score
	 * pooled with an agreement percentage would render a plausible number that means nothing.
	 */
	await expect(page.locator('body')).toContainText(/No drill sittings yet/i);
});
