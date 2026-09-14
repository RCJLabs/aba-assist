import { expect, test } from '@playwright/test';

test('home page search filters the glossary', async ({ page }) => {
	await page.goto('/');
	await page.getByLabel('Search terms').fill('motivating');
	await expect(page.getByRole('link', { name: /Motivating Operation/ })).toBeVisible();

	// Asserts that filtering narrowed the list, not an exact count: the glossary grows,
	// and a test pinned to "1 result" breaks every time a term mentioning the query is
	// added, which says nothing about whether search works.
	const shown = await page.locator('.results li').count();
	expect(shown).toBeGreaterThan(0);
	expect(shown).toBeLessThan(10);
});

test('search matches an alias, not just the term name', async ({ page }) => {
	await page.goto('/');
	// "MO" is an alias of Motivating Operation.
	await page.getByLabel('Search terms').fill('MO');
	await expect(page.getByRole('link', { name: /Motivating Operation/ })).toBeVisible();
});

test('a term page renders both definitions and can toggle between them', async ({ page }) => {
	await page.goto('/glossary/negative-reinforcement');
	await expect(
		page.getByRole('heading', { level: 1, name: 'Negative Reinforcement' })
	).toBeVisible();

	// The technical definition is the default, so a reader with no JS still gets content.
	await expect(page.getByText(/removed, reduced, or postponed/)).toBeVisible();

	await page.getByRole('button', { name: /plain language/i }).click();
	await expect(page.getByText(/Negative here means something was taken away/)).toBeVisible();
});

test('term pages are prerendered — content is in the HTML without JavaScript', async ({
	browser
}) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto('/glossary/motivating-operation');
	await expect(
		page.getByRole('heading', { level: 1, name: 'Motivating Operation' })
	).toBeVisible();
	await expect(page.getByText(/alters the current effectiveness/)).toBeVisible();
	await context.close();
});

test('cross-references between terms navigate correctly', async ({ page }) => {
	await page.goto('/glossary/motivating-operation');
	await page
		.getByRole('link', { name: 'Discriminative Stimulus', exact: true })
		.first()
		.click();
	await expect(page).toHaveURL(/glossary\/discriminative-stimulus/);
	await expect(
		page.getByRole('heading', { level: 1, name: 'Discriminative Stimulus' })
	).toBeVisible();
});

test('the content version is shown so staleness is visible', async ({ page }) => {
	await page.goto('/about');
	await expect(page.getByText(/Content version/)).toBeVisible();
	await expect(page.getByText(/3rd ed\./)).toBeVisible();
});

test('focus moves to main content after navigation', async ({ page }) => {
	await page.goto('/');
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Glossary' })
		.click();
	await expect(page).toHaveURL(/\/glossary$/);
	const focusedId = await page.evaluate(() => document.activeElement?.id);
	expect(focusedId).toBe('main');
});

test('fuzzy search finds a misspelling once the index has loaded', async ({ page }) => {
	await page.goto('/');
	await page.getByLabel('Search terms').fill('reinforcment');

	// Wait for the handover rather than racing it: under a loaded CI machine the index
	// can take a while to fetch and deserialise, and a bare timeout makes this flaky.
	await expect(page.locator('form[role="search"]')).toHaveAttribute(
		'data-search-status',
		'ready',
		{ timeout: 30_000 }
	);

	// The substring fallback cannot match a misspelling, so a hit here proves the fuzzy
	// index is actually the thing answering.
	await expect(page.getByRole('link', { name: /Reinforcement/ }).first()).toBeVisible();
});

test('search answers before the fuzzy index is ready', async ({ page }) => {
	await page.goto('/');
	await page.getByLabel('Search terms').fill('extinction');

	// Asserted while the index is still loading: the instant fallback must already have
	// answered. This is the property that makes the search usable on a slow connection.
	await expect(page.getByRole('link', { name: /Extinction/ })).toBeVisible({ timeout: 2000 });
});

test('one-handed mode can be turned on and persists across navigation', async ({ page }) => {
	await page.goto('/settings');
	await page.getByRole('checkbox', { name: /One-handed mode/ }).check();
	await expect(page.locator('html')).toHaveAttribute('data-onehanded', 'true');

	await page.getByRole('link', { name: 'Glossary', exact: true }).click();
	await expect(page.locator('html')).toHaveAttribute('data-onehanded', 'true');
});

test('text size setting changes the rendered scale', async ({ page }) => {
	await page.goto('/settings');
	await page.getByRole('radio', { name: 'Larger' }).check();
	const scale = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim()
	);
	expect(scale).toBe('1.3');
});

test('theme choice persists across a reload', async ({ page }) => {
	await page.goto('/settings');
	await page.getByRole('radio', { name: 'Dark' }).check();
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the product name is consistent across the UI and the manifest', async ({ page }) => {
	// The name appears in the wordmark, every page title, and the web manifest, which is
	// what labels the icon on a home screen. A partial rename leaves the installed app
	// called one thing and the site another, and nothing else would catch it.
	const NAME = 'ABA Assist';

	await page.goto('/');
	await expect(page.getByRole('banner').getByRole('link', { name: NAME })).toBeVisible();
	await expect(page).toHaveTitle(new RegExp(NAME));

	const manifest = await page.evaluate(async () => {
		const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]');
		if (!link) throw new Error('no manifest link — the app would not be installable');
		return (await (await fetch(link.href)).json()) as { name: string; short_name: string };
	});
	expect(manifest.name).toBe(NAME);
	expect(manifest.short_name).toBe(NAME);

	for (const route of ['/glossary', '/scenarios', '/help', '/about', '/settings']) {
		await page.goto(route);
		expect(await page.title()).toContain(NAME);
	}
});
