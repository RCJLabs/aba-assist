import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './utils/a11y';

/**
 * Remembering what somebody looked up.
 *
 * Three things are worth testing in a real browser rather than in the unit suite,
 * because none is visible from the pure logic. That the recording fires on a
 * client-side navigation — the term page is one component reused across every slug, so
 * a mount hook would record the first term of a session and nothing after it. That the
 * off switch is actually off. And that clearing the reading list leaves the rest of
 * somebody's data where it was.
 */

const term = (page: Page, slug: string) => page.goto(`/glossary/${slug}`);

/**
 * Read the store directly.
 *
 * The probe must never create or upgrade the database itself. An `open` with no version
 * against a database the app has not made yet fires `upgradeneeded` and creates an empty
 * one, and a connection left open then blocks the app's own upgrade to the current
 * version — forever, since nothing here closes it. So the upgrade is aborted, every path
 * closes, and "not there" comes back as -1.
 */
function probe(page: Page, want: string): Promise<number> {
	return page.evaluate(
		(id) =>
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
					if (fresh || !db.objectStoreNames.contains('lookups')) {
						db.close();
						return resolve(-1);
					}
					const store = db.transaction('lookups').objectStore('lookups');
					const req = id === '' ? store.count() : store.get(id);
					req.onsuccess = () => {
						const r = req.result as number | { count: number } | undefined;
						db.close();
						resolve(typeof r === 'number' ? r : (r?.count ?? 0));
					};
					req.onerror = () => {
						db.close();
						resolve(-1);
					};
				};
			}),
		want
	);
}

/** Wait for the write, which is fire-and-forget and has no signal of its own. */
async function stored(page: Page, expected: number) {
	await expect.poll(() => probe(page, ''), { timeout: 15_000 }).toBe(expected);
}

test('records each entry opened, including ones reached without a page load', async ({
	page
}) => {
	/*
	 * The second term is reached by following a link rather than by navigating, which is
	 * the case a mount hook silently gets wrong — the slug changes and nothing remounts.
	 */
	await term(page, 'tact');
	await stored(page, 1);

	const onward = page.locator('main a[href*="/glossary/"]').first();
	await onward.click();
	await expect(page.locator('h1')).not.toHaveText('Tact');
	await stored(page, 2);
});

test('offers the way back to what was being read, and only on a second visit', async ({
	page
}) => {
	await page.goto('/glossary');
	// Nothing to go back to yet, so the shortcut is not there to be ignored.
	await expect(page.locator('[data-lookup-list]')).toHaveCount(0);

	await term(page, 'tact');
	await stored(page, 1);

	await page.goto('/glossary');
	const list = page.locator('[data-lookup-list]');
	await expect(list).toBeVisible({ timeout: 15_000 });
	await expect(list.getByRole('link', { name: /Tact/ })).toBeVisible();
});

test('says what it can see without calling it a weak spot', async ({ page }) => {
	/*
	 * The framing is the feature. A count of visits is not a measure of knowledge, and
	 * copy that says otherwise would be the app making a claim it cannot support about
	 * somebody it has never assessed.
	 */
	await page.clock.install({ time: new Date('2026-09-20T09:00:00Z') });
	await term(page, 'tact');
	await stored(page, 1);

	// Past the sitting window, so the second visit is a second lookup rather than the
	// same one continuing.
	await page.clock.fastForward('45:00');
	await term(page, 'tact');
	await expect.poll(() => probe(page, 'term:tact'), { timeout: 15_000 }).toBe(2);

	await page.goto('/progress');
	const section = page.locator('[data-lookups]');
	await expect(section).toBeVisible({ timeout: 15_000 });
	await expect(section).toContainText('Opened 2 times');
	await expect(section).toContainText('not the same as not knowing them');
	await expectNoA11yViolations(page);
});

test('records nothing once the reader turns it off', async ({ page }) => {
	await page.goto('/settings');
	const toggle = page.getByRole('checkbox', { name: 'Remember which entries I open' });
	await expect(toggle).toBeChecked();
	await toggle.uncheck();

	await term(page, 'tact');
	await page.goto('/glossary');
	// Given a chance to appear, and it must not.
	await expect(page.locator('[data-lookup-list]')).toHaveCount(0);
	// Zero rather than "no database": the settings page opens it to report the count.
	await stored(page, 0);
});

test('clearing the list leaves the rest of the data alone', async ({ page }) => {
	/*
	 * The reason this has its own button rather than only the erase-everything one. A
	 * request not to keep a reading list must not cost somebody their supervision records.
	 */
	const question = 'What do I do when the prompt level is not the one that works?';
	await page.goto('/tools/questions');
	await page.getByLabel('The question').fill(question);
	await page.getByRole('button', { name: 'Park it' }).click();
	await expect(page.getByText(question)).toBeVisible();

	await term(page, 'tact');
	await stored(page, 1);

	await page.goto('/settings');
	await page.getByRole('button', { name: 'Clear that list' }).click();
	await stored(page, 0);

	// The parked question survived.
	await page.goto('/tools/questions');
	await expect(page.getByText(question)).toBeVisible();
});
