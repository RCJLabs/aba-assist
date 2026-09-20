import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './utils/a11y';

/**
 * The supervisor's side of the supervision log.
 *
 * The case this exists to prove is the one that was silently wrong before: the same
 * store holds supervision received and supervision provided, and for a while both
 * counted toward the reader's own monthly requirement. An assistant analyst supervising
 * technicians at their own organisation was told they had met a requirement they had
 * not. That is checked here end to end, because the arithmetic being right in the unit
 * tests does not prove the two pages read it the right way round.
 */

async function ready(page: Page, path: string) {
	await page.goto(path);
	await expect(page.locator('[data-tracker-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
}

async function setUp(page: Page, credential = 'BCBA') {
	// `/tools` carries no readiness marker of its own; the credential select appearing is
	// the equivalent signal there.
	await page.goto('/tools');
	await page.getByLabel('Track requirements for').selectOption(credential);
	await ready(page, '/tools/supervision');
	await page.getByLabel('Organization name', { exact: true }).first().fill('Clinic');
	await page.getByRole('button', { name: /^Add organization$/ }).click();
	await expect(page.getByRole('heading', { name: 'Log a contact' })).toBeVisible();
}

async function addSupervisee(page: Page, code: string) {
	await page.getByLabel('Supervisee code').fill(code);
	await page.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(page.getByLabel('Supervisee', { exact: true })).toContainText(code);
}

/**
 * How many supervision contacts are in the store.
 *
 * Reads the database directly, and never creates or upgrades it: an `open` with no
 * version against a database the app has not made yet would create an empty one, and a
 * connection left open would block the app's own upgrade. So an upgrade is aborted and
 * "not there yet" comes back as -1, which never equals an expected count.
 */
function storedContacts(page: Page): Promise<number> {
	return page.evaluate(
		() =>
			new Promise<number>((resolve) => {
				const open = indexedDB.open('aba-assist');
				let fresh = false;
				open.onupgradeneeded = () => {
					fresh = true;
					open.transaction?.abort();
				};
				open.onerror = () => resolve(-1);
				open.onsuccess = () => {
					const db = open.result;
					if (fresh || !db.objectStoreNames.contains('supervisionEntries')) {
						db.close();
						return resolve(-1);
					}
					const req = db
						.transaction('supervisionEntries')
						.objectStore('supervisionEntries')
						.count();
					req.onsuccess = () => {
						db.close();
						resolve(req.result);
					};
					req.onerror = () => {
						db.close();
						resolve(-1);
					};
				};
			})
	);
}

async function logContact(
	page: Page,
	opts: { date: string; code?: string; observed?: boolean; group?: boolean }
) {
	await page.getByLabel('Date', { exact: true }).fill(opts.date);
	await page.getByLabel('Minutes', { exact: true }).fill('60');
	await page
		.getByLabel('Supervisee', { exact: true })
		.selectOption({ label: opts.code ?? 'Supervision I received' });
	await page
		.getByLabel('Format', { exact: true })
		.selectOption(opts.group ? 'small-group' : 'individual');
	const observed = page.getByLabel('The supervisor observed me working with a client');
	if (opts.observed === false) await observed.uncheck();
	else await observed.check();
	const before = await storedContacts(page);
	await page.getByRole('button', { name: 'Log contact' }).click();
	/*
	 * Wait on the database, not on the page.
	 *
	 * A caller that navigates immediately can abort the IndexedDB transaction in flight
	 * and then assert against a database that never received the contact. The obvious
	 * signal — the form resetting — is no signal at all here: the only field that clears
	 * is the note, and these contacts never set one, so the assertion passed instantly
	 * and proved nothing. It held on the desktop profile by timing luck and dropped a
	 * contact on the slower mobile one.
	 *
	 * There is no page-visible signal to use instead, and that is a consequence of the
	 * change this file exists to test: supervision logged *to a supervisee* no longer
	 * appears in the reader's own month summary, so on the supervision page nothing
	 * changes at all when one is recorded.
	 */
	await expect.poll(() => storedContacts(page), { timeout: 15_000 }).toBe(before + 1);
}

test('shows a month per supervisee, judged against their hours', async ({ page }) => {
	await setUp(page);
	await addSupervisee(page, 'S-01');
	await logContact(page, { date: '2026-09-04', code: 'S-01' });
	await logContact(page, { date: '2026-09-11', code: 'S-01', observed: false, group: true });

	await page.goto('/tools/caseload');
	const month = page.locator('[data-caseload-month]').first();
	await expect(month).toBeVisible();

	// No hours yet, so the percentage is unknowable rather than failed.
	await expect(month).toContainText('Needs their hours');

	await page.getByLabel('Month', { exact: true }).fill('2026-09');
	await page.getByLabel('Hours they worked').fill('30');
	await page.getByRole('button', { name: 'Record these hours' }).click();

	await expect(page.locator('[data-caseload-month]').first()).toContainText(
		'Requirements met'
	);
	// 5% of 30 is 1.5, and two hours were delivered.
	await expect(page.locator('[data-caseload-month]').first()).toContainText('1.5');
});

test('does not let supervision you gave pad your own month', async ({ page }) => {
	/*
	 * The regression. Before the two directions were separated, the contacts below — all
	 * delivered to a supervisee — counted toward the reader's own requirement, and the
	 * supervision page reported a month as met that had no supervision received in it.
	 */
	/*
	 * A BCaBA, deliberately: the one credential that both owes monthly supervision and
	 * delivers it. A BCBA has no ongoing requirement of their own to pad, so the bug was
	 * invisible from that seat — which is part of why it survived.
	 */
	await setUp(page, 'BCaBA');
	await addSupervisee(page, 'S-01');
	await logContact(page, { date: '2026-09-04', code: 'S-01' });
	await logContact(page, { date: '2026-09-11', code: 'S-01' });

	await page.getByLabel('Month', { exact: true }).fill('2026-09');
	await page.getByLabel('Service hours', { exact: true }).fill('30');
	await page.getByRole('button', { name: 'Save hours' }).click();

	// The reader's own record: two contacts were logged, but neither was to them.
	const own = page.locator('.month').first();
	await expect(own).toBeVisible();
	await expect(own).not.toContainText('Requirements met');

	// And the same two contacts are the supervisee's whole month.
	await page.goto('/tools/caseload');
	await expect(page.locator('[data-caseload-month]').first()).toContainText('2 contacts');
});

test('keeps two supervisees apart', async ({ page }) => {
	await setUp(page);
	await addSupervisee(page, 'S-01');
	await addSupervisee(page, 'S-02');
	await logContact(page, { date: '2026-09-04', code: 'S-01' });
	await logContact(page, { date: '2026-09-11', code: 'S-02' });
	await logContact(page, { date: '2026-09-18', code: 'S-02' });

	await page.goto('/tools/caseload');
	const first = page.locator('section.person').filter({ hasText: 'S-01' });
	const second = page.locator('section.person').filter({ hasText: 'S-02' });
	await expect(first.locator('[data-caseload-month]')).toContainText('1 contact');
	await expect(second.locator('[data-caseload-month]')).toContainText('2 contacts');
});

test('prints the evidence, not just the verdict', async ({ page }) => {
	/*
	 * A record whose working is folded away is a claim with nothing under it. The
	 * contacts are listed rather than put in a `<details>` precisely because a disclosure
	 * cannot be reliably opened for print.
	 */
	await setUp(page);
	await addSupervisee(page, 'S-01');
	await logContact(page, { date: '2026-09-04', code: 'S-01' });

	await page.goto('/tools/caseload');
	await page.emulateMedia({ media: 'print' });

	const month = page.locator('[data-caseload-month]').first();
	await expect(month.getByText('2026-09-04')).toBeVisible();
	// Exact, because the check label above it also reads "1 one-to-one".
	await expect(month.getByText('one-to-one', { exact: true })).toBeVisible();
	// And the form is not on the paper.
	await expect(page.getByRole('button', { name: 'Record these hours' })).toBeHidden();
});

test('says plainly that it is not the form', async ({ page }) => {
	/*
	 * A supervision attestation is a document whose wording belongs to the certifying
	 * body or the employer. Producing something that looked like one would be this app
	 * claiming an authority it does not have.
	 */
	await setUp(page);
	await addSupervisee(page, 'S-01');
	await logContact(page, { date: '2026-09-04', code: 'S-01' });

	await page.goto('/tools/caseload');
	await expect(page.locator('.attest')).toContainText('It is not that form');
});

test('has no accessibility violations with a caseload on it', async ({ page }) => {
	await setUp(page);
	await addSupervisee(page, 'S-01');
	await logContact(page, { date: '2026-09-04', code: 'S-01' });
	await page.goto('/tools/caseload');
	await expect(page.locator('[data-caseload-month]').first()).toBeVisible();
	await expectNoA11yViolations(page);
});
