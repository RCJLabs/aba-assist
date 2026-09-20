import { expect, test, type Page } from '@playwright/test';

/**
 * What a search engine and a chat client see.
 *
 * Worth testing in the built output rather than in the unit suite, because the pure
 * functions cannot tell you whether a page actually renders the component, whether a tag
 * ended up on the page twice, or whether the JSON-LD survived being put inside a script
 * element. All three are silent failures: the page looks perfect to a reader.
 */

const content = (page: Page, selector: string) =>
	page.locator(selector).first().getAttribute('content');

async function jsonLd(page: Page): Promise<Record<string, unknown>> {
	const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
	return JSON.parse(raw ?? '{}');
}

test('a term page describes itself to a scraper', async ({ page }) => {
	await page.goto('/glossary/tact');

	expect(await page.title()).toBe('Tact — ABA Assist');
	expect(await content(page, 'meta[property="og:title"]')).toBe('Tact — ABA Assist');
	expect(await content(page, 'meta[property="og:type"]')).toBe('article');
	expect(await content(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');

	// The description is the page's own gloss, not a site-wide boilerplate.
	const description = await content(page, 'meta[name="description"]');
	expect(description).toBeTruthy();
	expect(description).toBe(await content(page, 'meta[property="og:description"]'));
	expect(description).not.toContain('offline reference and study tool');
});

test('every share tag appears exactly once', async ({ page }) => {
	/*
	 * The reason the tags live in one component rather than being defaulted in the layout
	 * and overridden per page: `<svelte:head>` does not deduplicate, and which of two
	 * `og:title` tags a scraper reads is not this app's decision to make.
	 */
	await page.goto('/glossary/tact');
	for (const selector of [
		'title',
		'link[rel="canonical"]',
		'meta[name="description"]',
		'meta[property="og:title"]',
		'meta[property="og:description"]',
		'meta[property="og:url"]',
		'meta[property="og:image"]',
		'meta[name="twitter:card"]'
	]) {
		await expect(page.locator(selector)).toHaveCount(1);
	}
});

test('the absolute URLs are absolute, and agree with each other', async ({ page }) => {
	await page.goto('/glossary/tact');
	const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
	const ogUrl = await content(page, 'meta[property="og:url"]');
	const image = await content(page, 'meta[property="og:image"]');

	expect(canonical).toMatch(/^https:\/\//);
	expect(canonical).toContain('/glossary/tact');
	expect(ogUrl).toBe(canonical);
	expect(image).toMatch(/^https:\/\/.+\/og\.png$/);
});

test('the share card the tags point at is actually there', async ({ page, request }) => {
	/*
	 * A card that 404s is worse than no card: the chat client renders a broken preview
	 * rather than falling back to a plain link. The tags name an absolute URL on the
	 * deployment origin, which this test cannot reach, so the path is checked against the
	 * server under test instead.
	 */
	await page.goto('/');
	const image = (await content(page, 'meta[property="og:image"]')) ?? '';
	const path = new URL(image).pathname;
	const res = await request.get(path);
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toContain('image/png');
});

test('a glossary entry is marked up as a defined term', async ({ page }) => {
	await page.goto('/glossary/tact');
	const ld = await jsonLd(page);

	expect(ld['@type']).toBe('DefinedTerm');
	expect(ld.termCode).toBe('tact');
	// The structured data has to say what the page says. Markup that drifts from the
	// visible content is the thing that gets rich results withdrawn.
	expect(ld.name).toBe(await page.locator('h1').first().innerText());
	expect(ld.description).toBe(await content(page, 'meta[name="description"]'));
	expect((ld.inDefinedTermSet as Record<string, string>)['@type']).toBe('DefinedTermSet');
});

test('the glossary index is marked up as the set, and states its real size', async ({
	page
}) => {
	await page.goto('/glossary');
	const ld = await jsonLd(page);

	expect(ld['@type']).toBe('DefinedTermSet');
	// Read off the page rather than hard-coded, so growing the corpus does not fail this.
	const shown = await page.locator('main p').first().innerText();
	const count = Number(/(\d+)\s+terms/.exec(shown)?.[1]);
	expect(count).toBeGreaterThan(0);
	expect(ld.numberOfItems).toBe(count);
});

test('the reviewer queue stays out of search results', async ({ page }) => {
	await page.goto('/review');
	expect(await content(page, 'meta[name="robots"]')).toBe('noindex');
	// And it is the only page that says so.
	await page.goto('/glossary/tact');
	await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});
