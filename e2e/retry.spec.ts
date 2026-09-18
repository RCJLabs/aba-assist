import { expect, test, type Page } from '@playwright/test';

/**
 * Retrying what you missed.
 *
 * Every finished run has recorded the questions it caught the reader out on since the
 * quiz was built, and until now nothing read them back. What is tested here is mostly the
 * honesty of the offer: that it is absent when there is nothing to retry, that it clears
 * when a question has been put right, and that it says so out loud when an outstanding
 * question is no longer in the build rather than quietly showing a smaller number.
 */

/**
 * Write finished runs straight into the app's own database, as the app would have.
 *
 * Driving the UI can produce a miss (see the simulation test below) but it cannot produce
 * a *specific* one, and these cases are about which ids survive the walk through the
 * history. The ids here are deliberately not real: a question this build does not have is
 * itself one of the cases, and the two that must not appear in the offer are easier to
 * assert on when nothing in the bank could have supplied them.
 */
async function seedAttempts(
	page: Page,
	runs: { daysAgo: number; missed: string[]; right?: string[] }[]
) {
	await page.goto('/progress');
	/*
	 * `ready`, not merely attached. `idle` is on the page from the first render, before the
	 * app has opened the database — seeding there calls `indexedDB.open` with no version,
	 * which creates an empty database rather than joining the app's, and the next line then
	 * asks it for stores nobody has made.
	 */
	await expect(page.locator('[data-progress-status="ready"]')).toBeAttached({
		timeout: 30_000
	});

	await page.evaluate(async (payload) => {
		const db = await new Promise<IDBDatabase>((res, rej) => {
			const req = indexedDB.open('aba-assist');
			req.onsuccess = () => res(req.result);
			req.onerror = () => rej(req.error);
		});
		const at = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;
		await new Promise<void>((done, fail) => {
			const tx = db.transaction('quizAttempts', 'readwrite');
			tx.oncomplete = () => done();
			tx.onerror = () => fail(tx.error);
			payload.forEach((run, i) =>
				tx.objectStore('quizAttempts').put({
					id: `seed-retry-${i}`,
					credential: 'RBT',
					domain: 'all',
					startedAt: at(run.daysAgo),
					finishedAt: at(run.daysAgo),
					total: 10,
					correct: 10 - run.missed.length,
					perDomain: {},
					missed: run.missed,
					...(run.right ? { right: run.right } : {}),
					tasks: []
				})
			);
		});
		db.close();
	}, runs);
}

test('nothing is offered before anything has been missed', async ({ page }) => {
	await page.goto('/quiz');
	await expect(page.locator('.setup')).toContainText(/\d+\s+questions available/);
	/*
	 * Absent, not zeroed. A permanent "0 questions to retry" panel is a standing reminder
	 * of a feature that does not apply to this reader yet, on the one screen that has to
	 * stay quick to get through.
	 */
	await expect(page.getByRole('heading', { name: 'Questions you have missed' })).toHaveCount(
		0
	);
});

test('a question answered correctly since is not offered again', async ({ page }) => {
	/*
	 * The decision the whole feature rests on. Without it the queue only grows, and a queue
	 * that hands back questions the reader has since learned is one nobody opens twice.
	 */
	await seedAttempts(page, [
		{ daysAgo: 9, missed: ['seeded-question-a'] },
		{ daysAgo: 2, missed: [], right: ['seeded-question-a'] }
	]);

	await page.goto('/quiz');
	await expect(page.locator('.setup')).toContainText(/\d+\s+questions available/);
	await expect(page.getByRole('heading', { name: 'Questions you have missed' })).toHaveCount(
		0
	);
});

test('an outstanding question no longer in the build is counted and explained', async ({
	page
}) => {
	/*
	 * Questions are rebuilt from source on every release and the release channel withholds
	 * what has not been reviewed, so a recorded id can simply stop existing. The figure has
	 * to explain itself rather than quietly shrinking, which is how an app teaches people
	 * not to trust any number on the page.
	 */
	await seedAttempts(page, [{ daysAgo: 3, missed: ['a-question-this-build-does-not-have'] }]);

	await page.goto('/quiz');
	const panel = page.locator('.retry');
	await expect(panel).toBeVisible();
	await expect(panel).toHaveAttribute('data-outstanding', '0');
	await expect(panel.locator('[data-retry-gone="1"]')).toContainText(
		'not in this version of the app'
	);
	// And there is nothing to start, because there is nothing this build could ask.
	await expect(panel.getByRole('button', { name: /^Retry/ })).toHaveCount(0);
});

test('a missed question comes back, and the run says that is what it is', async ({ page }) => {
	/*
	 * The one case that has to go through the real bank rather than seeded ids, so it is
	 * produced the way a reader would produce it. A simulation lets a question be skipped,
	 * and a skipped question is a wrong answer on the day and here — so finishing early
	 * leaves every unreached question outstanding, deterministically.
	 */
	await page.goto('/quiz');
	await page.getByLabel('Full exam simulation, against the clock').check();
	await page.getByRole('button', { name: 'Start the clock' }).click();
	await page.getByRole('button', { name: 'Skip' }).click();
	await page.getByRole('button', { name: 'Finish early' }).click();
	await expect(page.getByRole('heading', { name: /of \d+ correct/ })).toBeVisible();

	// The offer lands where the reader is most willing to take it: next to what they missed.
	const fromResults = page.getByRole('button', {
		name: /Retry \d+ questions? you have missed/
	});
	await expect(fromResults).toBeVisible();

	// Back to setup, ask for five, and take the five that have caught them out most.
	await page.getByRole('button', { name: 'Change settings' }).click();
	// Back off the simulation first: it hides the length control, because the real paper
	// does not let you pick one.
	await page.getByRole('radio', { name: 'After each question' }).check();
	await page.getByLabel('Number of questions').selectOption('5');
	const panel = page.locator('.retry');
	await expect(panel).toBeVisible();
	await expect(panel).toContainText('caught you out most');
	await panel.getByRole('button', { name: 'Retry 5 questions' }).click();

	await expect(page.locator('.progress')).toContainText('Question 1 of 5');
	/*
	 * Said on every question of the run. Without it a reader who recognises the third
	 * question in a row is left wondering whether the app is repeating itself.
	 */
	await expect(page.locator('.progress')).toContainText('one you missed before');
	// No clock: a run drawn from five questions already known to be wrong is not a paper,
	// and pacing it against the exam's would make the number at the end mean nothing.
	await expect(page.getByRole('timer')).toHaveCount(0);

	// Answer all five, then check the run is set apart from a fresh draw where it counts.
	for (let i = 1; i <= 5; i++) {
		await page.getByRole('radio').first().check();
		await page.getByRole('button', { name: 'Check answer' }).click();
		await page.getByRole('button', { name: i < 5 ? 'Next question' : 'See results' }).click();
	}
	await expect(page.locator('[data-retry-run]')).toContainText(
		'not comparable with a fresh draw'
	);
});

test('a retry sitting is kept off the trend and accounted for underneath it', async ({
	page
}) => {
	await seedAttempts(page, [{ daysAgo: 6, missed: ['seeded-question-b'] }]);

	// One retry sitting, written the way a retry run writes itself.
	await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((res, rej) => {
			const req = indexedDB.open('aba-assist');
			req.onsuccess = () => res(req.result);
			req.onerror = () => rej(req.error);
		});
		await new Promise<void>((done, fail) => {
			const tx = db.transaction('quizAttempts', 'readwrite');
			tx.oncomplete = () => done();
			tx.onerror = () => fail(tx.error);
			tx.objectStore('quizAttempts').put({
				id: 'seed-retry-run',
				credential: 'RBT',
				domain: 'missed',
				startedAt: Date.now() - 3600_000,
				finishedAt: Date.now() - 3600_000,
				total: 8,
				correct: 3,
				perDomain: {},
				missed: [],
				right: [],
				tasks: []
			});
		});
		db.close();
	});

	await page.goto('/progress');
	await expect(page.locator('[data-progress-status="ready"]')).toBeAttached({
		timeout: 30_000
	});

	/*
	 * Off the chart, because a run drawn only from past errors scores below a fresh draw
	 * for reasons that say nothing about whether the reader is improving — and counted
	 * underneath it, because a sitting that simply vanished would look like lost data.
	 */
	await expect(page.locator('[data-retries="1"]')).toContainText('not on this chart');
	await expect(page.locator('[data-retries="1"]')).toContainText('3 of 8');
});
