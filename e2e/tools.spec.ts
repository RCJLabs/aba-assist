import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './utils/a11y';

/**
 * The supervision and development tracker.
 *
 * Two things are worth testing more than the happy path. The first is that there is
 * nowhere in this feature to put a client's identity — that is the property which keeps
 * the whole app outside HIPAA, and it is enforced by the shape of the data rather than by
 * anyone's restraint. The second is that the arithmetic says "I cannot tell" when it
 * cannot, rather than reporting a missing denominator as non-compliance.
 */

async function openTools(page: Page, path = '/tools'): Promise<void> {
	await page.goto(path);
	await expect(page.locator('[data-tracker-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
}

async function addWorkplace(page: Page, label: string): Promise<void> {
	await page.getByLabel('Organization name', { exact: true }).first().fill(label);
	await page.getByRole('button', { name: /^Add organization$/ }).click();
	await expect(page.getByRole('heading', { name: 'Log a contact' })).toBeVisible();
}

async function logContact(
	page: Page,
	opts: { date: string; minutes: number; group?: boolean; observed?: boolean }
): Promise<void> {
	await page.getByLabel('Date', { exact: true }).fill(opts.date);
	await page.getByLabel('Minutes', { exact: true }).fill(String(opts.minutes));
	await page
		.getByLabel('Format', { exact: true })
		.selectOption(opts.group ? 'small-group' : 'individual');
	const observed = page.getByLabel('The supervisor observed me working with a client');
	if (opts.observed === false) await observed.uncheck();
	else await observed.check();

	const before = await page.locator('.month').count();
	await page.getByRole('button', { name: 'Log contact' }).click();
	/*
	 * Wait for the write to land before returning.
	 *
	 * The month summary only appears once the entry is in IndexedDB and back in state, so
	 * it is the signal that the transaction committed. Without this a caller that
	 * navigates immediately — `page.goto` is a full document load — can abort the write in
	 * flight and then assert against a database that never received it. It failed that way
	 * roughly one full run in three, on the slower project only.
	 */
	if (before === 0) await expect(page.locator('.month')).not.toHaveCount(0);
	await expect(page.getByLabel('What the contact covered')).toHaveValue('');
}

test('the tracker refuses to call a missing denominator non-compliance', async ({ page }) => {
	await openTools(page, '/tools/supervision');
	await addWorkplace(page, 'Riverside Clinic');

	await logContact(page, { date: '2026-09-04', minutes: 60 });
	await logContact(page, { date: '2026-09-18', minutes: 60, group: true, observed: false });

	const month = page.locator('.month').first();
	await expect(month).toHaveAttribute('data-standing', 'unknown');
	await expect(month).toContainText('Needs your service hours');
	await expect(month).toContainText('Enter the hours you delivered');

	// Now give it the denominator: 120 minutes against 5% of 30 hours is enough.
	await page.getByLabel('Month', { exact: true }).fill('2026-09');
	await page.getByLabel('Service hours', { exact: true }).fill('30');
	await page.getByRole('button', { name: 'Save hours' }).click();

	await expect(month).toHaveAttribute('data-standing', 'met');
	await expect(month).toContainText('Requirements met');
});

test('a month short on the percentage is marked short, with the reason', async ({ page }) => {
	await openTools(page, '/tools/supervision');
	await addWorkplace(page, 'Riverside Clinic');

	await logContact(page, { date: '2026-09-04', minutes: 15 });
	await logContact(page, { date: '2026-09-18', minutes: 15, group: true, observed: false });
	await page.getByLabel('Month', { exact: true }).fill('2026-09');
	await page.getByLabel('Service hours', { exact: true }).fill('40');
	await page.getByRole('button', { name: 'Save hours' }).click();

	const month = page.locator('.month').first();
	await expect(month).toHaveAttribute('data-standing', 'short');
	// The contact rules passed; only the amount failed, which is the distinction that
	// matters to somebody trying to fix it.
	await expect(month.locator('li[data-met="false"]')).toHaveCount(1);
	await expect(month).toContainText('0.5 of 2 hours needed');
});

test('there is no way to store a name against a supervisee', async ({ page }) => {
	await openTools(page, '/tools/supervision');

	const code = page.getByLabel('Supervisee code');
	const add = page.getByRole('button', { name: 'Add', exact: true }).last();

	await code.fill('Jamie Rivera');
	await expect(add).toBeDisabled();
	await expect(
		page.getByText(/up to three capital letters then a number/).first()
	).toBeVisible();

	await code.fill('S-04');
	await expect(add).toBeEnabled();
	await add.click();
	await expect(page.locator('.people')).toContainText('S-04');

	// And the same code cannot be added twice, which would otherwise split one person's
	// contacts across two rows and quietly halve a monthly total.
	await code.fill('S-04');
	await expect(add).toBeDisabled();
	await expect(page.getByText('That code is already in use.')).toBeVisible();
});

test('the note warns when it looks like it carries a client identifier', async ({ page }) => {
	await openTools(page, '/tools/supervision');
	await addWorkplace(page, 'Riverside Clinic');

	const note = page.getByLabel('What the contact covered');
	await note.fill('Reviewed the data sheet for the escape condition.');
	await expect(page.locator('.warn')).toHaveCount(0);

	await note.fill('Talked about Jamie Rivera, DOB 04/12/2015');
	await expect(page.getByText(/may be somebody’s name/)).toBeVisible();
	await expect(page.getByText(/looks like a date of birth/)).toBeVisible();

	// A warning, not a block: the contact still logs.
	await page.getByRole('button', { name: 'Log contact' }).click();
	await expect(page.locator('.month')).toHaveCount(1);
});

test('a technician cycle counts down and reports what is left', async ({ page }) => {
	await openTools(page, '/tools/development');
	await expect(page.getByText('12 PDUs every 2 years')).toBeVisible();

	await page.getByLabel('Cycle started').fill('2026-01-01');
	await page.getByRole('button', { name: 'Add cycle' }).click();

	// Two years from 1 January 2026 ends on 31 December 2027, not 1 January 2028.
	await expect(page.getByRole('heading', { name: /Cycle to 2027-12-31/ })).toBeVisible();

	await page.getByLabel('PDUs', { exact: true }).fill('4');
	await page.getByLabel('What it was').fill('Discrete trial refresher');
	await page.getByRole('button', { name: 'Add', exact: true }).first().click();

	await expect(page.locator('.checks')).toContainText('4 of 12 earned');
	await expect(page.locator('.remaining')).toContainText('8 PDUs to go');
});

test('an analyst can be 32 units in and still short on ethics', async ({ page }) => {
	await openTools(page);
	await page.getByLabel('Track requirements for').selectOption('BCBA');

	await page.goto('/tools/development');
	await expect(page.locator('[data-tracker-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
	await expect(page.locator('.lede')).toContainText('32 CEUs every 2 years');

	await page.getByLabel('Cycle started').fill('2026-01-01');
	await page
		.getByLabel('I supervised a technician, assistant analyst or trainee in this cycle')
		.check();
	await page.getByRole('button', { name: 'Add cycle' }).click();

	await page.getByLabel('CEUs', { exact: true }).fill('32');
	await page.getByLabel('What it was').fill('A long conference');
	await page.getByRole('button', { name: 'Add', exact: true }).first().click();

	const checks = page.locator('.checks');
	await expect(checks).toContainText('32 of 32 earned');
	// The whole reason this screen exists: the total is met and the cycle is not.
	await expect(checks.locator('li[data-met="false"]')).toHaveCount(2);
	await expect(checks).toContainText('0 of 4 earned');
	await expect(checks).toContainText('0 of 3 earned');
});

test('the hub summarises both tools and offers the CSV once there is something in it', async ({
	page
}) => {
	await openTools(page, '/tools/supervision');
	await addWorkplace(page, 'Riverside Clinic');
	await logContact(page, { date: '2026-09-04', minutes: 60 });

	await openTools(page);
	await expect(page.getByRole('button', { name: 'Supervision CSV' })).toBeEnabled();
	await expect(page.getByRole('button', { name: 'Development CSV' })).toBeDisabled();

	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Supervision CSV' }).click();
	const file = await download;
	expect(file.suggestedFilename()).toMatch(/^supervision-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('Tools is reachable from the bottom navigation on every page', async ({ page }) => {
	await page.goto('/glossary');
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Tools' })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible();
});

test('the tracker with data in it is accessible', async ({ page }) => {
	await openTools(page, '/tools/supervision');
	await addWorkplace(page, 'Riverside Clinic');
	await logContact(page, { date: '2026-09-04', minutes: 60 });
	await page.getByLabel('Month', { exact: true }).fill('2026-09');
	await page.getByLabel('Service hours', { exact: true }).fill('30');
	await page.getByRole('button', { name: 'Save hours' }).click();
	await expect(page.locator('.month')).toHaveCount(1);
	await expectNoA11yViolations(page);
});

test('the note guides show the elements, the phrasing pairs, and who decides', async ({
	page
}) => {
	await page.goto('/tools/notes');

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Writing session notes');
	// Both guides render, with their content rather than a placeholder.
	await expect(page.locator('.items li')).toHaveCount(9);
	await expect(page.locator('.pairs li')).toHaveCount(14);

	// Every guide names who actually sets the requirements, because this app does not.
	await expect(page.locator('.who')).toHaveCount(2);
	await expect(page.locator('.who').first()).toContainText(/employer|funder/i);

	// Checking boxes is scratch paper: it is reported, and it does not survive leaving the page.
	const progress = page.getByRole('status');
	await expect(progress).toContainText('0 of 9 checked');
	await page.locator('.items input[type="checkbox"]').first().check();
	await expect(progress).toContainText('1 of 9 checked');

	await page.goto('/tools');
	await page.goto('/tools/notes');
	await expect(page.getByRole('status')).toContainText('0 of 9 checked');
});

test('the phrasing guide labels each side in words, not only by colour', async ({ page }) => {
	await page.goto('/tools/notes');
	const first = page.locator('.pairs li').first();
	await expect(first.locator('.tag').first()).toHaveText('Instead of');
	await expect(first.locator('.tag').nth(1)).toHaveText('Write');
});

test('the note guides have a plain-language reading', async ({ page }) => {
	await page.goto('/tools/notes');
	const summaries = page.locator('.summary');
	await expect(summaries.first()).not.toHaveClass(/plain/);
	await page.getByRole('button', { name: /plain language/i }).click();
	await expect(summaries.first()).toHaveClass(/plain/);
	await expect(summaries.first()).toContainText('health record');
});
