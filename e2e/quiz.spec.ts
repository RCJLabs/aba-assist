import { expect, test } from '@playwright/test';

test('a practice session gives a rationale for every option and a per-area result', async ({
	page
}) => {
	await page.goto('/quiz');
	await page.getByLabel('Exam', { exact: true }).selectOption('RBT');
	await page.getByLabel('Number of questions').selectOption('5');
	// `\s+` rather than a space: the count and the noun are separate template expressions,
	// and the formatter may put a line break between them.
	await expect(page.locator('.setup')).toContainText(/\d+\s+questions available/);
	await page.getByRole('button', { name: 'Start' }).click();

	for (let i = 1; i <= 5; i++) {
		// The progress line, not a text search: the live region announces the same words.
		await expect(page.locator('.progress')).toContainText(`Question ${i} of 5`);
		// The answer button is disabled until something is selected.
		await expect(page.getByRole('button', { name: 'Check answer' })).toBeDisabled();
		await page.getByRole('radio').first().check();
		await page.getByRole('button', { name: 'Check answer' }).click();

		// Feedback: every option carries a rationale, and the verdict is stated in words.
		await expect(page.locator('.rationale')).toHaveCount(4);
		await expect(page.getByRole('region', { name: 'Explanation' })).toBeVisible();
		await expect(page.locator('.verdict-top')).toContainText(/Correct\.|Not correct\./);

		await page.getByRole('button', { name: i < 5 ? 'Next question' : 'See results' }).click();
	}

	await expect(page.getByRole('heading', { name: /\d of 5 correct/ })).toBeVisible();
	await expect(page.getByRole('table')).toBeVisible();
});

test('test mode withholds feedback until the end, and says so', async ({ page }) => {
	await page.goto('/quiz');
	await page.getByLabel('Number of questions').selectOption('5');
	await page.getByRole('radio', { name: /At the end/ }).check();
	await page.getByRole('button', { name: 'Start' }).click();

	/*
	 * The button used to say "Check answer" here, in the one mode that does not check it.
	 * Pressing it records the answer and moves on, so the label has to say that, and the
	 * run has to say where the answers went.
	 */
	await expect(page.getByRole('button', { name: 'Check answer' })).toHaveCount(0);
	await expect(page.locator('.progress')).toContainText('answers at the end');

	await page.getByRole('radio').first().check();
	await page.getByRole('button', { name: 'Answer and continue' }).click();
	await expect(page.locator('.rationale')).toHaveCount(0);
	await expect(page.locator('.progress')).toContainText('Question 2 of 5');

	// The last question finishes the run rather than continuing it.
	for (let i = 2; i <= 4; i++) {
		await page.getByRole('radio').first().check();
		await page.getByRole('button', { name: 'Answer and continue' }).click();
	}
	await page.getByRole('radio').first().check();
	await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
});

test('practice mode still offers to check the answer', async ({ page }) => {
	await page.goto('/quiz');
	await page.getByLabel('Number of questions').selectOption('5');
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('.progress')).not.toContainText('answers at the end');
	await page.getByRole('radio').first().check();
	await page.getByRole('button', { name: 'Check answer' }).click();
	await expect(page.locator('.rationale').first()).toBeVisible();
});

test('a single area can be drilled, and the BCBA bank is separate', async ({ page }) => {
	await page.goto('/quiz');
	await page.getByLabel('Exam', { exact: true }).selectOption('BCBA');
	await page.getByLabel('Content area').selectOption('D');
	// A count, not a particular count: pinning the bank size here would mean every
	// question added to the bank breaks a test about the area filter.
	await expect(page.locator('.setup')).toContainText(/\d+\s+questions available/);
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('.progress')).toContainText(/BCBA\s+D\.\d/);
});

test('a negated question is flagged before the reader answers it', async ({ page }) => {
	await page.goto('/quiz');
	await page.getByLabel('Exam', { exact: true }).selectOption('RBT');
	await page.getByLabel('Content area').selectOption('E');
	await page.getByLabel('Number of questions').selectOption('1000');

	/*
	 * How many there are, read off the page, rather than a number written here. A sitting
	 * drawn from one area is shuffled, so a fixed cap walks a shrinking fraction of a
	 * growing bank: at 12 questions it saw all of them, at 26 it missed the negated one
	 * roughly a quarter of the time, and the failure looks exactly like flake.
	 */
	const available = Number(
		/(\d+)\s+questions available/.exec(await page.locator('.setup').innerText())?.[1]
	);
	expect(available).toBeGreaterThan(0);

	await page.getByRole('button', { name: 'Start' }).click();

	// Walk the whole area; exactly one E question is negated and it must show the callout.
	let seen = 0;
	for (let i = 0; i < available; i++) {
		if (await page.locator('.callout').isVisible()) seen++;
		await page.getByRole('radio').first().check();
		await page.getByRole('button', { name: 'Check answer' }).click();
		const next = page.getByRole('button', { name: /Next question|See results/ });
		const label = await next.innerText();
		await next.click();
		if (label.includes('See results')) break;
	}
	expect(seen).toBe(1);
});

/**
 * The exam simulator.
 *
 * The valuable thing it rehearses is pace, not question count — finding out on the day
 * that the technician paper gives you a little over a minute per question is the problem
 * it exists to solve. Which is also why it has to be honest about being short: this build
 * has fewer questions written than the real paper has items, and padding by repeating
 * them would make the number on screen a lie.
 */
test('the simulator runs the technician paper at full length and at its real pace', async ({
	page
}) => {
	await page.goto('/quiz');
	await page.getByLabel('Full exam simulation, against the clock').check();

	const plan = page.locator('.plan');
	await expect(plan).toContainText('63.5s');
	// The technician paper: 85 questions in 90 minutes. The bank can now fill it, so the
	// page must say so rather than carrying the shortfall notice it used to.
	await expect(plan).toContainText('85 questions in 90 minutes');
	await expect(plan).toContainText('every area, weighted like the exam');
	await expect(plan).not.toContainText('This is not full length.');

	// Picking an area or a length is not offered, because the real exam does not offer it.
	await expect(page.getByLabel('Content area')).toBeHidden();
	await expect(page.getByLabel('Number of questions')).toBeHidden();
});

test('the clock runs, and the run can be finished early', async ({ page }) => {
	await page.goto('/quiz');
	await page.getByLabel('Full exam simulation, against the clock').check();
	await page.getByRole('button', { name: 'Start the clock' }).click();

	const clock = page.getByRole('timer');
	await expect(clock).toBeVisible();
	const first = (await clock.innerText()).trim();

	// It counts down from the device clock rather than from a decremented number.
	await expect(async () => {
		expect((await clock.innerText()).trim()).not.toBe(first);
	}).toPass({ timeout: 5000 });

	await page.getByRole('button', { name: 'Finish early' }).click();
	await expect(page.getByRole('heading', { name: /of \d+ correct/ })).toBeVisible();
	await expect(page.locator('.results')).toContainText("at the exam's pace");
});

test('a simulation lets you flag a question and come back to it', async ({ page }) => {
	await page.goto('/quiz');
	await page.getByLabel('Full exam simulation, against the clock').check();
	await page.getByRole('button', { name: 'Start the clock' }).click();

	await page.getByRole('button', { name: 'Flag for review' }).click();
	await expect(page.locator('.exambar')).toContainText('1 flagged');

	await page.getByRole('button', { name: 'Skip' }).click();
	await expect(page.locator('.progress')).toContainText('Question 2 of');

	// The navigator says what each question's state is in words, not only by colour.
	const navigator = page.getByRole('navigation', { name: 'Questions' });
	await expect(
		navigator.getByRole('button', { name: /Question 1, not answered, flagged/ })
	).toBeVisible();

	await navigator.getByRole('button', { name: /^Question 1,/ }).click();
	await expect(page.locator('.progress')).toContainText('Question 1 of');
	await expect(page.getByRole('button', { name: 'Unflag' })).toBeVisible();
});

test('a simulation withholds every rationale until the end', async ({ page }) => {
	await page.goto('/quiz');
	await page.getByLabel('Full exam simulation, against the clock').check();
	await page.getByRole('button', { name: 'Start the clock' }).click();

	await page.locator('.options input').first().check();
	await page.getByRole('button', { name: 'Answer and continue' }).click();

	// No verdict, no explanation — straight to the next question, like the real paper.
	await expect(page.locator('.explanation')).toHaveCount(0);
	await expect(page.locator('.progress')).toContainText('Question 2 of');
	await expect(page.locator('.exambar')).toContainText('1 answered');
});

test('a choice made before the page hydrates is still honoured', async ({ page }) => {
	/*
	 * The page is prerendered, so the form is on screen and usable before the bundle has
	 * loaded. Two things could throw that choice away: the change handler is not wired
	 * yet, and — worse — the template's `value={…}` puts the select back when it does
	 * render. Blocking the bundle reproduces the window rather than racing it.
	 */
	let release: (() => void) | undefined;
	const held = new Promise<void>((r) => (release = r));
	await page.route('**/_app/immutable/**', async (route) => {
		await held;
		await route.continue();
	});

	await page.goto('/quiz', { waitUntil: 'commit' });
	await page.locator('#quiz-count').selectOption('5');
	await page.locator('#quiz-exam').selectOption('BCBA');

	release?.();
	await expect(page.locator('#quiz-count')).toHaveValue('5');
	await expect(page.locator('#quiz-exam')).toHaveValue('BCBA');

	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('.progress')).toContainText('Question 1 of 5');
	await expect(page.locator('.progress')).toContainText('BCBA');
});

test('practice shows how the run is going, and puts the verdict where it can be seen', async ({
	page
}) => {
	await page.goto('/quiz');
	await page.getByLabel('Number of questions').selectOption('5');
	await page.getByRole('button', { name: 'Start' }).click();

	const bar = page.getByRole('progressbar', { name: 'Questions answered' });
	await expect(bar).toHaveAttribute('aria-valuenow', '0');
	await expect(bar).toHaveAttribute('aria-valuemax', '5');
	await expect(page.locator('.tally')).toHaveCount(0);

	await page.getByRole('radio').first().check();
	await page.getByRole('button', { name: 'Check answer' }).click();

	/*
	 * Checking an option scrolls it into view, so the verdict has to come to the reader
	 * rather than wait above the stem for them to scroll back up.
	 */
	const verdict = page.locator('.verdict-top');
	await expect(verdict).toBeFocused();
	await expect(verdict).toBeInViewport();
	await expect(verdict).toContainText(/Correct\.|Not correct\./);

	await expect(bar).toHaveAttribute('aria-valuenow', '1');
	await expect(page.locator('.tally')).toContainText('of 1 right so far');
	// The segment says which, and so does the tally — the colour is never the only reading.
	await expect(page.locator('.seg').first()).toHaveAttribute('data-state', /right|wrong/);
});

test('the progress bar never leaks the answer key in a mode that withholds it', async ({
	page
}) => {
	await page.goto('/quiz');
	await page.getByLabel('Number of questions').selectOption('5');
	await page.getByRole('radio', { name: /At the end/ }).check();
	await page.getByRole('button', { name: 'Start' }).click();

	await page.getByRole('radio').first().check();
	await page.getByRole('button', { name: 'Answer and continue' }).click();

	/*
	 * Test mode holds every verdict back until the end. A bar coloured right and wrong
	 * would hand the key back one segment at a time, so an answered question here is
	 * answered and nothing more.
	 */
	await expect(page.locator('.seg').first()).toHaveAttribute('data-state', 'done');
	await expect(page.locator('.seg[data-state="right"]')).toHaveCount(0);
	await expect(page.locator('.seg[data-state="wrong"]')).toHaveCount(0);
	// And no running score, for the same reason.
	await expect(page.locator('.tally')).toHaveCount(0);
});

test('results show each area as a figure and as a bar', async ({ page }) => {
	await page.goto('/quiz');
	await page.getByLabel('Number of questions').selectOption('5');
	await page.getByRole('button', { name: 'Start' }).click();
	for (let i = 0; i < 5; i++) {
		await page.getByRole('radio').first().check();
		await page.getByRole('button', { name: 'Check answer' }).click();
		await page.getByRole('button', { name: /Next question|See results/ }).click();
	}
	await expect(page.getByRole('heading', { name: /correct/ })).toBeVisible();
	// The table is still the reading; the bars ride along inside it.
	const rows = page.locator('.areas tbody tr');
	await expect(rows.first()).toContainText('%');
	await expect(page.locator('.areas .fill').first()).toBeAttached();
});
