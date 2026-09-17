import { expect, test, type Page } from '@playwright/test';

/**
 * The progress page.
 *
 * Most of what is asserted here is restraint. The page is willing to state a retention
 * rate and a trend only above thresholds the unit tests already cover; what those tests
 * cannot cover is whether the page honours them once real records are in IndexedDB — a
 * figure withheld by the arithmetic and then rendered anyway by the template is exactly
 * the kind of bug that ships looking fine.
 */

/**
 * Write records straight into the app's own database, as the app would have.
 *
 * Seeding beats driving the UI here: producing twenty graded reviews of already-learned
 * cards through the flashcard session would take a scheduler run per card and still not
 * put them in the review state, which is the exact subset these tests are about.
 */
async function seed(
	page: Page,
	data: {
		attempts?: { correct: number; total: number; daysAgo: number }[];
		reviews?: { grade: number; state: number; daysAgo: number }[];
	}
) {
	await page.goto('/progress');
	await expect(page.locator('[data-progress-status]')).toBeAttached({ timeout: 30_000 });

	await page.evaluate(async (payload) => {
		const open = () =>
			new Promise<IDBDatabase>((resolve, reject) => {
				const req = indexedDB.open('aba-assist');
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			});
		const db = await open();
		const at = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;

		await new Promise<void>((done, fail) => {
			const tx = db.transaction(['quizAttempts', 'reviewLog'], 'readwrite');
			tx.oncomplete = () => done();
			tx.onerror = () => fail(tx.error);
			payload.attempts?.forEach((a, i) =>
				tx.objectStore('quizAttempts').put({
					id: `seed-${i}`,
					credential: 'RBT',
					domain: 'all',
					startedAt: at(a.daysAgo),
					finishedAt: at(a.daysAgo),
					total: a.total,
					correct: a.correct,
					perDomain: {},
					missed: []
				})
			);
			payload.reviews?.forEach((r) =>
				tx.objectStore('reviewLog').add({
					cardId: 'shaping',
					grade: r.grade,
					reviewedAt: at(r.daysAgo),
					scheduledDays: 1,
					state: r.state
				})
			);
		});
		db.close();
	}, data);

	await page.reload();
	await expect(page.locator('[data-progress-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
}

test('with no history it invites you to make some rather than showing zeros', async ({
	page
}) => {
	await page.goto('/progress');
	await expect(page.locator('[data-progress-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
	await expect(page.locator('.card')).toContainText(/nothing to\s+show yet/i);
});

test('a handful of sittings are listed, and no trend is drawn from them', async ({ page }) => {
	/*
	 * Three sittings is not a direction. Drawing a chart through them would let a reader
	 * conclude they were improving or declining from what is mostly which questions they
	 * happened to draw.
	 */
	await seed(page, {
		attempts: [
			{ correct: 4, total: 10, daysAgo: 6 },
			{ correct: 7, total: 10, daysAgo: 4 },
			{ correct: 6, total: 10, daysAgo: 2 }
		]
	});

	await expect(page.locator('.sittings li')).toHaveCount(3);
	await expect(page.locator('.shift')).toHaveCount(0);
	await expect(page.locator('.hint').first()).toContainText(/2 more\s+sittings/i);
	// The most recent sitting is still stated as a fact about itself.
	await expect(page.locator('.figure').first()).toContainText('60%');
});

test('enough sittings draws the trend and states the direction in words', async ({ page }) => {
	await seed(page, {
		attempts: [
			{ correct: 3, total: 10, daysAgo: 12 },
			{ correct: 4, total: 10, daysAgo: 10 },
			{ correct: 4, total: 10, daysAgo: 8 },
			{ correct: 8, total: 10, daysAgo: 6 },
			{ correct: 8, total: 10, daysAgo: 4 },
			{ correct: 9, total: 10, daysAgo: 2 }
		]
	});

	await expect(page.locator('.sittings')).toHaveCount(0);
	// A direction anybody can check against the numbers, not a coloured arrow.
	await expect(page.locator('.shift')).toContainText(/up\s+\d+\s+points/i);
	await expect(page.locator('.shift')).toHaveAttribute('data-direction', 'up');
	await expect(page.locator('svg[role="img"]').first()).toBeVisible();
});

test('the chart carries its numbers in words and in a table', async ({ page }) => {
	await seed(page, {
		attempts: Array.from({ length: 6 }, (_, n) => ({
			correct: 5,
			total: 10,
			daysAgo: 12 - n * 2
		}))
	});

	// The accessible name is the information, not a description of the shape.
	const alt = await page.locator('svg[role="img"]').first().getAttribute('aria-label');
	expect(alt).toMatch(/50%/);
	expect(alt).not.toMatch(/bar chart|graph of/i);

	await page
		.getByRole('group')
		.first()
		.getByText(/show the numbers/i)
		.click();
	await expect(page.locator('table tbody tr').first()).toBeVisible();
});

test('retention is withheld below the minimum and stated above it', async ({ page }) => {
	await seed(page, {
		reviews: Array.from({ length: 5 }, () => ({ grade: 3, state: 2, daysAgo: 1 }))
	});
	await expect(page.locator('body')).toContainText('5 of 5');
	await expect(page.locator('body')).toContainText(/15 more\s+reviews/i);
	await expect(page.locator('body')).not.toContainText('100%');
});

test('learning a new card is not counted as a memory failure', async ({ page }) => {
	/*
	 * The subset that makes the figure honest. Twenty clean reviews plus twenty "Again"s
	 * from cards being learned for the first time is 100% retention, not 50%.
	 */
	await seed(page, {
		reviews: [
			...Array.from({ length: 20 }, () => ({ grade: 3, state: 2, daysAgo: 2 })),
			...Array.from({ length: 20 }, () => ({ grade: 1, state: 1, daysAgo: 2 }))
		]
	});
	await expect(page.locator('body')).toContainText('100%');
	await expect(page.locator('body')).toContainText('20 of 20');
});

test('the day chart shows the gaps, not only the study days', async ({ page }) => {
	await seed(page, {
		reviews: [
			{ grade: 3, state: 2, daysAgo: 0 },
			{ grade: 3, state: 2, daysAgo: 1 },
			{ grade: 3, state: 2, daysAgo: 20 }
		]
	});
	// Thirty buckets whatever happened, so an unopened deck looks unopened.
	const rows = page.locator('details table tbody tr');
	await page
		.getByText(/show the numbers/i)
		.last()
		.click();
	await expect(rows.last()).toBeVisible();
	await expect(page.locator('.runs')).toContainText(/current run:\s*2\s+days/i);
});
