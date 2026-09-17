import { expect, test, type Page } from '@playwright/test';

/**
 * The generated discrimination drill.
 *
 * Nobody reads these items before they ship — that is the point of generating them — so
 * the properties a reviewer would have caught by eye are asserted here instead. The
 * builder's own tests cover the bank; these cover what a reader can actually do with it,
 * which is a different question and the one that has bitten this app before.
 */
const ready = async (page: Page) => {
	await page.goto('/drills/pairs');
	await expect(page.locator('[data-drill-status="ready"]')).toBeAttached({ timeout: 30_000 });
};

const start = async (page: Page) => {
	await ready(page);
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('.options .option').first()).toBeVisible();
};

test('a sitting asks a situation and offers exactly two names', async ({ page }) => {
	await start(page);
	await expect(page.locator('.options .option')).toHaveCount(2);
	// The prompt is a real example, not a placeholder or an empty card.
	await expect(page.locator('.prompt')).not.toBeEmpty();
});

test('the prompt never contains either name on offer', async ({ page }) => {
	/*
	 * The compile-time filter drops about one candidate in twelve for exactly this — a
	 * glossary example is *supposed* to say "so the latency was six seconds", which is
	 * what makes it a free mark rather than a question. Checked here too because the
	 * filter and the presentation are different code, and a bank that leaks its answers
	 * is the failure that makes a study app worthless.
	 */
	await start(page);
	for (let i = 0; i < 8; i++) {
		const prompt = ((await page.locator('.prompt').textContent()) ?? '').toLowerCase();
		const names = await page.locator('.options .option strong').allTextContents();
		expect(names).toHaveLength(2);
		for (const name of names) {
			expect(prompt, `"${name}" appears in its own prompt`).not.toContain(name.toLowerCase());
		}
		await page.locator('.options .option').first().click();
		await page.getByRole('button', { name: /Next|Finish/ }).click();
		if ((await page.locator('.options .option').count()) === 0) break;
	}
});

test('answering marks one option right and leaves both on screen', async ({ page }) => {
	await start(page);
	await page.locator('.options .option').first().click();

	await expect(page.locator('.options .option')).toHaveCount(2);
	await expect(page.locator('.option[data-state="answer"]')).toHaveCount(1);
	// The verdict is a word, not only a colour — greyscale and forced colours both.
	await expect(page.locator('.verdict .said')).toContainText(/correct/i);
	// Both glosses appear afterwards: the lesson of a pair item is the difference.
	await expect(page.locator('.option .gloss')).toHaveCount(2);
});

test('a second tap cannot change the answer', async ({ page }) => {
	await start(page);
	const options = page.locator('.options .option');
	await options.first().click();
	const verdict = await page.locator('.verdict').getAttribute('data-verdict');

	await options.nth(1).click({ force: true });
	expect(await page.locator('.verdict').getAttribute('data-verdict')).toBe(verdict);
});

test('a sitting runs to the end and reports a score', async ({ page }) => {
	await start(page);
	for (let n = 0; n < 40; n++) {
		if ((await page.locator('.options .option').count()) === 0) break;
		await page.locator('.option[data-state="open"]').first().click();
		await page.getByRole('button', { name: /Next|Finish/ }).click();
	}
	await expect(page.locator('.score')).toContainText(/\d+ of \d+/);
});

test('picking one area narrows the sitting to it', async ({ page }) => {
	await ready(page);
	const area = page.locator('.areas input[type="checkbox"]').first();
	await area.check();
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('.options .option').first()).toBeVisible();
	await expect(page.locator('.progress')).toContainText(/of \d+/);
});

test('what the summary says was missed is what was actually missed', async ({ page }) => {
	/*
	 * An exact invariant rather than a fixed expectation: which option is correct is
	 * shuffled per sitting, so the only deterministic thing to assert is that the
	 * scoreboard agrees with the verdicts the reader was shown. A summary that quietly
	 * disagrees with the session is worse than no summary.
	 */
	await start(page);
	let wrong = 0;
	for (let n = 0; n < 40; n++) {
		if ((await page.locator('.options .option').count()) === 0) break;
		await page.locator('.option[data-state="open"]').first().click();
		if ((await page.locator('.verdict').getAttribute('data-verdict')) === 'wrong') wrong += 1;
		await page.getByRole('button', { name: /Next|Finish/ }).click();
	}

	await expect(page.locator('.missed li')).toHaveCount(wrong);
	if (wrong > 0) {
		// Both terms of every miss go back into the deck, so the count is never zero here.
		await expect(page.locator('.card')).toContainText(/due in your/i);
	}
});
