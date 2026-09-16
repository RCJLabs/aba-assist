import { expect, test, type Page } from '@playwright/test';
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

	const observed = page.getByLabel(
		'My supervisor observed me working with a client this month'
	);
	if (opts.observed === false) await observed.uncheck();
	else await observed.check();

	const before = await page.locator('.month').count();
	await page.getByRole('button', { name: 'Save month' }).click();
	// The month card only renders once the write has landed and come back through state,
	// so it is the signal that the IndexedDB transaction committed.
	if (before === 0) await expect(page.locator('.month')).not.toHaveCount(0);
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
