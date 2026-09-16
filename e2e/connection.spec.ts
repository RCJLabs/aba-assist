import { expect, test } from '@playwright/test';

/**
 * The offline notice.
 *
 * Offline is the reason to install this app, and it is also the moment a reader is most
 * likely to doubt that it works. The notice exists to answer that, and to say the one
 * thing that genuinely stops working.
 */

test('says nothing while the device reports a connection', async ({ page }) => {
	await page.goto('/glossary');
	await expect(page.locator('[data-offline]')).toHaveCount(0);
});

test('appears when the connection goes, and says the app still works', async ({
	page,
	context
}) => {
	await page.goto('/glossary');
	await context.setOffline(true);

	const notice = page.locator('[data-offline]');
	await expect(notice).toBeVisible();
	await expect(notice).toContainText('No connection');
	await expect(notice).toContainText('still works');
	/*
	 * The one real limitation, said rather than left to be discovered. `\s+` rather than a
	 * space: the formatter may wrap the sentence, and a hard line break is whitespace the
	 * rendered text keeps.
	 */
	await expect(notice).toContainText(/Links to other sites will not\s+open/i);

	// The page it is sitting on is still the page: precached content, not an error.
	await expect(page.getByRole('heading', { level: 1, name: 'Glossary' })).toBeVisible();
});

test('goes away when the connection comes back, and never claims to be online', async ({
	page,
	context
}) => {
	await page.goto('/glossary');
	await context.setOffline(true);
	await expect(page.locator('[data-offline]')).toBeVisible();

	await context.setOffline(false);
	await expect(page.locator('[data-offline]')).toHaveCount(0);

	/*
	 * `navigator.onLine` is true for a captive portal and for a router with no route out,
	 * so an "online" badge would be wrong often enough to matter. The absence of the bar
	 * is the whole of the positive state.
	 *
	 * Matched on the claim rather than on the word: "connected" is ordinary vocabulary in
	 * this corpus — a chained routine is a connected one — and a pattern loose enough to
	 * catch a glossary entry is not testing this page.
	 */
	await expect(page.getByText(/you are online|back online|you are connected/i)).toHaveCount(0);
});

test('sits below the navigation rather than over it', async ({ page, context }) => {
	await page.goto('/glossary');
	await context.setOffline(true);
	const notice = page.locator('[data-offline]');
	await expect(notice).toBeVisible();

	// The primary controls stay reachable: this is something to know, not something to
	// act on, and it must not take the thumb zone from the things that are.
	const nav = page.getByRole('navigation', { name: 'Main' });
	await expect(nav).toBeInViewport();
	const navBox = await nav.boundingBox();
	const noticeBox = await notice.boundingBox();
	expect(noticeBox!.y).toBeGreaterThanOrEqual(navBox!.y + navBox!.height - 1);
});
