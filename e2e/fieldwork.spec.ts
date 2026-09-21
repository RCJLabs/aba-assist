import { expect, test, type Download, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './utils/a11y';

/**
 * The fieldwork tracker.
 *
 * What is worth testing here is not the arithmetic — that is unit-tested — but the two
 * things the interface has to get right or the feature is worse than nothing. A month
 * below the monthly floor must be visibly worth zero, because a running total that
 * quietly includes it is exactly how somebody arrives at verification a year later short
 * of hours they thought they had. And the two ratios whose scope the handbook does not
 * settle must appear as figures with the uncertainty stated, never as a pass or a fail.
 */

async function open(page: Page): Promise<void> {
	await page.goto('/tools/fieldwork');
	await expect(page.locator('[data-tracker-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
}

async function startPeriod(page: Page, start = '2026-01-01'): Promise<void> {
	await page.getByLabel('First day of fieldwork').fill(start);
	await page.getByLabel('Supervisor code').fill('S-01');
	await page.getByRole('button', { name: 'Start tracking' }).click();
	await expect(page.getByRole('heading', { name: 'Log a month' })).toBeVisible();
}

/**
 * One month as the database holds it.
 *
 * Reads directly, and never creates or upgrades: an `open` with no version against a
 * database the app has not made yet would create an empty one, and a connection left open
 * would block the app's own upgrade. So an upgrade is aborted and "not there yet" comes
 * back as null, which never equals an expected row.
 */
function storedMonth(
	page: Page,
	month: string
): Promise<{ contacts: number; supervisionHours: number } | null> {
	return page.evaluate(
		(wanted) =>
			new Promise<{ contacts: number; supervisionHours: number } | null>((resolve) => {
				const request = indexedDB.open('aba-assist');
				let fresh = false;
				request.onupgradeneeded = () => {
					fresh = true;
					request.transaction?.abort();
				};
				request.onerror = () => resolve(null);
				request.onsuccess = () => {
					const db = request.result;
					if (fresh || !db.objectStoreNames.contains('fieldworkMonths')) {
						db.close();
						return resolve(null);
					}
					const all = db
						.transaction('fieldworkMonths')
						.objectStore('fieldworkMonths')
						.getAll();
					all.onsuccess = () => {
						db.close();
						const row = (
							all.result as { month: string; contacts: number; supervisionHours: number }[]
						).find((r) => r.month === wanted);
						resolve(
							row ? { contacts: row.contacts, supervisionHours: row.supervisionHours } : null
						);
					};
					all.onerror = () => {
						db.close();
						resolve(null);
					};
				};
			}),
		month
	);
}

async function logMonth(
	page: Page,
	opts: {
		month: string;
		total: number;
		unrestricted?: number;
		supervision?: number;
		individual?: number;
		contacts?: number;
		observed?: boolean;
		concentrated?: boolean;
		supervisor?: string;
		signed?: boolean;
		groupSize?: number;
	}
): Promise<void> {
	await page.getByLabel('Month', { exact: true }).fill(opts.month);
	await page
		.getByLabel('Fieldwork type')
		.selectOption(opts.concentrated ? 'concentrated' : 'supervised');
	await page.getByLabel('Total fieldwork hours').fill(String(opts.total));
	await page.getByLabel('Unrestricted hours').fill(String(opts.unrestricted ?? 0));
	await page.getByLabel('Supervision hours').fill(String(opts.supervision ?? 0));
	await page.getByLabel('Of that, one-to-one').fill(String(opts.individual ?? 0));
	await page.getByLabel('Supervisor contacts').fill(String(opts.contacts ?? 0));
	await page.getByLabel('Largest group meeting').fill(String(opts.groupSize ?? 0));
	// Left alone unless a test cares: the field prefills from the month before, falling
	// back to the supervisor the run started with, so the common case needs no typing.
	if (opts.supervisor !== undefined) {
		await page.getByLabel('Supervisor this month').fill(opts.supervisor);
	}
	const signedBox = page.getByLabel(
		'The monthly verification form for this month has been signed'
	);
	if (opts.signed) await signedBox.check();
	else await signedBox.uncheck();

	const observed = page.getByLabel(
		'My supervisor observed me working with a client this month'
	);
	if (opts.observed === false) await observed.uncheck();
	else await observed.check();

	await page.getByRole('button', { name: 'Save month' }).click();
	/*
	 * Wait on the stored row, not on the card count.
	 *
	 * Counting cards asserts nothing when a save replaces a month rather than adding one —
	 * and replacing is how a correction is made here, so it is a real path with real tests
	 * on it. The previous version waited only when there were no cards at all, which meant
	 * every save after the first raced whatever the test did next and held by timing luck.
	 *
	 * Polling the store covers both: a new month's row appears, an edited month's row
	 * changes. Contacts and supervision hours are the signature because they are what the
	 * callers vary.
	 */
	await expect
		.poll(() => storedMonth(page, opts.month), { timeout: 15_000 })
		.toEqual({ contacts: opts.contacts ?? 0, supervisionHours: opts.supervision ?? 0 });
}

test('a month below the monthly floor credits nothing, and says so', async ({ page }) => {
	await open(page);
	await startPeriod(page);

	// 12 hours is under the 20-hour floor: the month is lost, not merely small.
	await logMonth(page, {
		month: '2026-02',
		total: 12,
		unrestricted: 8,
		supervision: 2,
		individual: 2,
		contacts: 4
	});

	const month = page.locator('.month').first();
	await expect(month).toHaveAttribute('data-standing', 'short');
	await expect(month).toContainText('0 credited');
	await expect(month).toContainText('Below the floor, so none of this month counts');

	await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
	await expect(page.locator('.stats')).toContainText('Hours that will not count');
});

test('a full month counts, and hours above the ceiling do not', async ({ page }) => {
	await open(page);
	await startPeriod(page);

	await logMonth(page, {
		month: '2026-03',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 4,
		contacts: 4
	});

	const met = page.locator('.month').first();
	await expect(met).toHaveAttribute('data-standing', 'met');
	await expect(met).toContainText('Counts in full');
	await expect(met).toContainText('100 credited');

	// 150 is over the 130-hour ceiling, so 20 hours are logged and never counted.
	await logMonth(page, {
		month: '2026-04',
		total: 150,
		unrestricted: 100,
		supervision: 10,
		individual: 6,
		contacts: 4
	});

	const over = page.locator('.month').first();
	await expect(over).toContainText('April 2026');
	await expect(over).toContainText('130 credited');
	await expect(over).toContainText('Above the ceiling, so the excess does not count');
	await expect(page.locator('.stats')).toContainText('20');
});

test('the monthly ratio is judged and the cumulative one is not', async ({ page }) => {
	await open(page);
	await startPeriod(page);

	await logMonth(page, {
		month: '2026-05',
		total: 100,
		unrestricted: 20,
		supervision: 6,
		individual: 1,
		contacts: 4
	});

	const month = page.locator('.month').first();
	// Individual supervision is a monthly requirement, so a month at 17% is short — and
	// only 2 of the 6 supervised hours survive the group cap, which supports 40 hours.
	await expect(month).toHaveAttribute('data-standing', 'short');
	await expect(month.locator('.checks').first()).toContainText('50% individual supervision');
	await expect(month).toContainText('40 credited');
	await expect(month.locator('.credit-note')).toContainText('5% supervision minimum');

	// Unrestricted activity is measured across the whole experience, so a light month is
	// not a lost one and gets no verdict here.
	const figures = month.locator('.figures');
	await expect(figures).toContainText('Unrestricted activity');
	await expect(figures).toContainText('across the whole experience, not this month');
	await expect(figures).not.toContainText('Individual supervision');
	await expect(figures.locator('li[data-met]')).toHaveCount(0);
});

test('a concentrated month is held to more and is worth more', async ({ page }) => {
	await open(page);
	await startPeriod(page);

	// 6 hours of supervision on 100 is 6% — enough supervised, short of concentrated's 10%.
	await logMonth(page, {
		month: '2026-06',
		total: 100,
		unrestricted: 60,
		supervision: 6,
		individual: 4,
		contacts: 4,
		concentrated: true
	});

	const month = page.locator('.month').first();
	await expect(month).toHaveAttribute('data-standing', 'short');
	await expect(month).toContainText('10% supervised');
	await expect(month).toContainText('6 supervisor contacts');

	// Meet both and the same hours are worth 1.33 times as much.
	await logMonth(page, {
		month: '2026-06',
		total: 100,
		unrestricted: 60,
		supervision: 10,
		individual: 6,
		contacts: 6,
		concentrated: true
	});
	await expect(page.locator('.month')).toHaveCount(1);
	await expect(page.locator('.month').first()).toContainText('133 credited');
});

test('there is nowhere to put a supervisor name', async ({ page }) => {
	await open(page);

	await page.getByLabel('Supervisor code').fill('Dr Sarah Whitfield');
	await expect(page.getByRole('button', { name: 'Start tracking' })).toBeDisabled();

	await page.getByLabel('Supervisor code').fill('S-01');
	await expect(page.getByRole('button', { name: 'Start tracking' })).toBeEnabled();

	// And no field anywhere in the form asks for a person or a client.
	const labels = await page.locator('label').allInnerTexts();
	expect(labels.join(' ')).not.toMatch(/\bname\b/i);
});

test('the fieldwork page has no accessibility violations once a month is logged', async ({
	page
}) => {
	await open(page);
	await startPeriod(page);
	await logMonth(page, {
		month: '2026-07',
		total: 80,
		unrestricted: 50,
		supervision: 4,
		individual: 2,
		contacts: 4
	});
	await expectNoA11yViolations(page);
});

test('the whole record exports as four files a supervisor could audit', async ({ page }) => {
	/*
	 * The export is the artifact and the app is the convenience. Fieldwork is verified
	 * from documentation, sometimes years later, by somebody who will not accept "it was
	 * in an app" — so what matters is that the four files together answer the questions a
	 * record has to answer, including where every threshold came from.
	 */
	await open(page);
	await startPeriod(page);
	await logMonth(page, { month: '2026-01', total: 120, unrestricted: 80, supervision: 6 });
	// A month under the monthly floor, so the record has something to say "does not count"
	// about — the failure mode the whole tracker exists for.
	await logMonth(page, { month: '2026-02', total: 15, unrestricted: 12, supervision: 1 });

	const downloads: Download[] = [];
	for (let i = 0; i < 4; i++) {
		const wait = page.waitForEvent('download');
		if (i === 0) await page.getByRole('button', { name: /The whole record/ }).click();
		downloads.push(await wait);
	}

	const names = downloads.map((d) => d.suggestedFilename()).sort();
	expect(names).toEqual([
		'fieldwork-1-period.csv',
		'fieldwork-2-months.csv',
		'fieldwork-3-totals.csv',
		'fieldwork-4-requirements.csv'
	]);

	const read = async (part: string) => {
		const d = downloads.find((x) => x.suggestedFilename().includes(part))!;
		const path = await d.path();
		const { readFile } = await import('node:fs/promises');
		return readFile(path, 'utf8');
	};

	// The months carry a verdict, not just the hours that were typed in.
	const months = await read('months');
	expect(months).toContain('Month standing');
	expect(months).toContain('short');
	expect(months).toContain('Requirements not met');

	// The totals state the ceiling as a number somebody can plan against.
	const totals = await read('totals');
	expect(totals).toContain('800 of 2000');
	expect(totals).toContain('Credited hours required,2000');

	// And every threshold says which handbook page it came from.
	const requirements = await read('requirements');
	expect(requirements).toContain('Handbook reference');
	expect(requirements).toMatch(/p\. \d+/);

	// No client information anywhere, because the record has nowhere to hold any.
	const period = await read('period');
	expect(period).toContain('S-01');
	for (const csv of [period, months, totals, requirements]) {
		expect(csv).not.toMatch(/client name|date of birth/i);
	}
});

test('each month records who supervised it, so a change of supervisor survives', async ({
	page
}) => {
	/*
	 * The defect this covers. One supervisor code lived on the fieldwork period, and the
	 * exported record stamped it on every month — so a trainee who changed supervisors
	 * produced a record attributing years of earlier months to whoever was current. The
	 * monthly verification form is completed per supervisor, so the code belongs on the
	 * month.
	 */
	await open(page);
	await startPeriod(page);

	await logMonth(page, {
		month: '2026-02',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 4,
		contacts: 4
	});
	await logMonth(page, {
		month: '2026-03',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 4,
		contacts: 4,
		supervisor: 'S-02'
	});

	const feb = page.locator('.month').filter({ hasText: 'February' });
	const mar = page.locator('.month').filter({ hasText: 'March' });
	// February kept the supervisor it was logged under rather than following the change.
	await expect(feb).toContainText('S-01');
	await expect(mar).toContainText('S-02');
	// And the run names both rather than only the current one.
	await expect(page.locator('.progress')).toContainText('S-01, S-02');
});

test('the month form remembers the supervisor rather than asking every time', async ({
	page
}) => {
	// Most months have the same supervisor as the month before, so typing it every time is
	// a tax on the common case — but it stays a visible field, because the month it changes
	// is the month somebody has to notice.
	await open(page);
	await startPeriod(page);
	await expect(page.getByLabel('Supervisor this month')).toHaveValue('S-01');
});

test('a supervisor typed as a name is refused, like everywhere else', async ({ page }) => {
	await open(page);
	await startPeriod(page);
	await page.getByLabel('Supervisor this month').fill('Dr Alvarez');
	await expect(page.getByRole('button', { name: 'Save month' })).toBeDisabled();
});

test('an unsigned month is chased without being called short', async ({ page }) => {
	/*
	 * The distinction the feature rests on: the rules decide whether a month's hours count,
	 * and a signature decides whether they can be shown to anybody. A faultless month with
	 * no form yet is not a short month, and reporting it as one would send somebody to redo
	 * work that was fine.
	 */
	await open(page);
	await startPeriod(page);
	await logMonth(page, {
		month: '2026-02',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 4,
		contacts: 4,
		signed: false
	});

	const month = page.locator('.month').first();
	await expect(month).toContainText('Counts in full');
	await expect(month).toContainText('form not signed yet');
	await expect(page.locator('.progress')).toContainText('no signed verification form yet');
	// Short is about hours, and these hours are fine.
	await expect(page.locator('.progress')).toContainText('Months short');
	await expect(page.locator('.stats')).toContainText('0');
});

test('a signed month records when it was signed', async ({ page }) => {
	await open(page);
	await startPeriod(page);
	await logMonth(page, {
		month: '2026-02',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 4,
		contacts: 4,
		signed: true
	});
	await page.getByLabel('Monthly form signed on').fill('2026-03-02');
	await page.getByRole('button', { name: 'Save month' }).click();

	await expect(page.locator('.month').first()).toContainText('form signed 2026-03-02');
	await expect(page.locator('.progress')).not.toContainText('no signed verification form yet');
});

test('the printed record carries the rules it judged the months against', async ({ page }) => {
	/*
	 * The flaw the exported spreadsheet has avoided since it was written, and the printout
	 * had: a verdict saying "Short" with no statement of the threshold, and no page to
	 * check it on, asks the reader to trust an app they have never seen.
	 */
	await open(page);
	await startPeriod(page);
	await logMonth(page, {
		month: '2026-02',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 4,
		contacts: 4,
		signed: true
	});

	await page.emulateMedia({ media: 'print' });

	const rules = page.locator('.rules');
	await expect(rules).toBeVisible();
	await expect(rules).toContainText('Hour Requirements, p. 15');
	await expect(rules).toContainText('Documentation of Fieldwork, p. 15');
	// The thresholds themselves, not just their page numbers.
	await expect(rules).toContainText('20 to 130');

	// Somewhere for both parties to sign, and a plain statement of what this is not.
	const attest = page.locator('.attest');
	await expect(attest).toBeVisible();
	await expect(attest).toContainText('It is not that form');
	await expect(attest.getByText('Supervisor', { exact: true })).toBeVisible();
	await expect(attest.getByText('Trainee', { exact: true })).toBeVisible();

	// And the form that produced it is not on the paper.
	await expect(page.getByRole('heading', { name: 'Log a month' })).toBeHidden();
	await expect(page.locator('.month').first()).toBeVisible();
});

test('the fieldwork record is accessible with months on it', async ({ page }) => {
	await open(page);
	await startPeriod(page);
	await logMonth(page, {
		month: '2026-02',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 4,
		contacts: 4,
		signed: true
	});
	await expectNoA11yViolations(page);
});

test('asks whether anybody checked the supervisor could supervise', async ({ page }) => {
	/*
	 * The largest single way to lose fieldwork, and the only one invisible from a log of
	 * hours: hours supervised by somebody who did not meet the requirements are worth
	 * nothing, however faultless the month looks. The app cannot check it — these are facts
	 * about another person, on a registry it cannot reach — so what it must not do is stay
	 * quiet, which reads as though the question were settled.
	 */
	await open(page);
	await startPeriod(page);
	await logMonth(page, {
		month: '2026-02',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 4,
		contacts: 4
	});

	const card = page.locator('[data-supervisor="S-01"]');
	await expect(card).toBeVisible();
	await expect(card).toHaveAttribute('data-state', 'unconfirmed');
	await expect(card).toContainText('Not checked yet');
	await expect(card).toContainText('1 month of this record rests on them');
	// And it never claims to have verified anything.
	await expect(page.locator('.supervisors')).toContainText(
		'your confirmation, not a verification'
	);
});

test('a supervisor is confirmed only when the contract is dated too', async ({ page }) => {
	await open(page);
	await startPeriod(page);
	await logMonth(page, {
		month: '2026-02',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 4,
		contacts: 4
	});

	await page.getByRole('button', { name: 'Check S-01' }).click();
	const form = page.locator('[data-supervisor="S-01"] form');
	for (const box of await form.getByRole('checkbox').all()) await box.check();
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	// Every box ticked, no contract date: still outstanding rather than confirmed.
	const card = page.locator('[data-supervisor="S-01"]');
	await expect(card).toHaveAttribute('data-state', 'incomplete');
	await expect(card).toContainText('No supervision contract date recorded');

	await page.getByRole('button', { name: 'Update S-01' }).click();
	await page.getByLabel('Supervision contract signed on').fill('2026-01-01');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.locator('[data-supervisor="S-01"]')).toHaveAttribute(
		'data-state',
		'confirmed'
	);
});

test('names months logged before the supervision contract existed', async ({ page }) => {
	// The one part of this that is arithmetic rather than somebody's say-so.
	await open(page);
	await startPeriod(page);
	await logMonth(page, {
		month: '2026-02',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 4,
		contacts: 4
	});

	await page.getByRole('button', { name: 'Check S-01' }).click();
	await page.getByLabel('Supervision contract signed on').fill('2026-04-01');
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	const card = page.locator('[data-supervisor="S-01"]');
	await expect(card).toContainText('Logged before that contract was signed: 2026-02');
	await expect(card).toContainText('do not count');
});

test('an unconfirmed supervisor does not silently void the hours', async ({ page }) => {
	/*
	 * Zeroing somebody's hours because they have not filled in a checklist would be the app
	 * inventing a finding. It says loudly what is unconfirmed and leaves the arithmetic
	 * alone.
	 */
	await open(page);
	await startPeriod(page);
	await logMonth(page, {
		month: '2026-02',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 4,
		contacts: 4
	});
	await expect(page.locator('.month').first()).toContainText('Counts in full');
	await expect(page.locator('.progress')).toContainText('100');
});

test('the supervisors survive onto the printed record', async ({ page }) => {
	await open(page);
	await startPeriod(page);
	await logMonth(page, {
		month: '2026-02',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 4,
		contacts: 4
	});
	await page.emulateMedia({ media: 'print' });

	const section = page.locator('.supervisors');
	await expect(section).toBeVisible();
	await expect(section).toContainText('S-01');
	await expect(section).toContainText('Supervisor qualifications, p. 13');
	// The controls are not on the paper.
	await expect(page.getByRole('button', { name: 'Check S-01' })).toBeHidden();
});

test('keeps the group size without pretending to judge it', async ({ page }) => {
	/*
	 * The handbook caps group supervision size and this app has not read that figure at
	 * source. Failing a month against a number it invented would be the exact failure the
	 * whole corpus is built against — so it keeps the number, shows it, and says who has to
	 * make the call. Recording it is the point: trivial now, impossible in two years.
	 */
	await open(page);
	await startPeriod(page);
	await logMonth(page, {
		month: '2026-02',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 3,
		contacts: 4,
		groupSize: 14
	});

	const month = page.locator('.month').first();
	await expect(month).toContainText('14 trainees in the largest group');
	await expect(month).toContainText('has not verified');
	// Reported, not failed.
	await expect(month).toHaveAttribute('data-standing', 'met');
});

test('does not ask about a group that did not happen', async ({ page }) => {
	await open(page);
	await startPeriod(page);
	await logMonth(page, {
		month: '2026-02',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 6,
		contacts: 4
	});
	await expect(page.locator('.month').first()).not.toContainText('largest group');
});

test('tracks the final verification form apart from the monthly ones', async ({ page }) => {
	// A separate document, and the last thing standing between a finished run and a
	// submitted one.
	await open(page);
	await startPeriod(page);
	await logMonth(page, {
		month: '2026-02',
		total: 100,
		unrestricted: 70,
		supervision: 6,
		individual: 4,
		contacts: 4
	});

	const section = page.locator('.final-form');
	await expect(section).toContainText('Not signed yet');
	await expect(section).toContainText('not the monthly ones');

	await section.getByLabel('Final form signed on').fill('2026-06-30');
	await expect(section).toContainText('Signed 2026-06-30');

	// And it survives a reload, which is the whole point of storing it.
	await page.reload();
	await expect(page.locator('[data-tracker-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
	await expect(page.locator('.final-form')).toContainText('Signed 2026-06-30');
});
