import { expect, test, type Page } from '@playwright/test';

/**
 * Two affordances that only exist once the app is installed, and one that does not.
 *
 * Neither the long-press menu nor the system share sheet can be opened from a test —
 * they belong to the operating system. What can be checked is everything this app is
 * responsible for: that the manifest names the right URLs, that those URLs are pages
 * rather than 404s, and that the share button does the right thing on each of the two
 * paths it has.
 */

interface Manifest {
	start_url: string;
	scope: string;
	shortcuts?: { name: string; short_name?: string; url: string }[];
}

async function manifest(page: Page): Promise<Manifest> {
	await page.goto('/');
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	const res = await page.request.get(href ?? '/manifest.webmanifest');
	expect(res.status()).toBe(200);
	return res.json();
}

test('offers the escalation cards first, and two other places worth jumping to', async ({
	page
}) => {
	/*
	 * The order is the point. This app's premise is one-handed use in a hallway,
	 * sometimes while something is going wrong, and the shortcut turns "open the app,
	 * find Help, tap" into "long-press, tap".
	 */
	const m = await manifest(page);
	expect(m.shortcuts).toBeDefined();
	const names = m.shortcuts!.map((s) => s.short_name ?? s.name);
	expect(names[0]).toBe('Urgent');
	expect(names).toEqual(['Urgent', 'Study', 'Timer']);
});

test('every shortcut URL is inside the app and actually resolves', async ({ page }) => {
	/*
	 * The failure this exists for: the plugin derives `start_url` and `scope` from the
	 * base path but does not touch shortcut URLs, so a bare `/help` on a project site
	 * points at the host root — somewhere else entirely. It would look right in the
	 * manifest and fail only on a real phone, months later.
	 */
	const m = await manifest(page);
	for (const shortcut of m.shortcuts!) {
		expect(shortcut.url.startsWith(m.scope)).toBe(true);
		const res = await page.request.get(shortcut.url);
		expect(res.status(), `${shortcut.url} should be a page`).toBe(200);
	}
});

test('the urgent shortcut lands on the page that refuses to give a procedure', async ({
	page
}) => {
	const m = await manifest(page);
	const urgent = m.shortcuts!.find((s) => s.short_name === 'Urgent')!;
	await page.goto(urgent.url);
	await expect(page.getByRole('heading', { level: 1 })).toContainText(/urgent/i);
});

test('shares through the system sheet where there is one', async ({ page }) => {
	await page.addInitScript(() => {
		(window as unknown as { __shared: unknown[] }).__shared = [];
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: (data: unknown) => {
				(window as unknown as { __shared: unknown[] }).__shared.push(data);
				return Promise.resolve();
			}
		});
	});
	await page.goto('/glossary/tact');
	await page.locator('[data-share]').click();

	const shared = await page.evaluate(
		() => (window as unknown as { __shared: { title: string; url: string }[] }).__shared
	);
	expect(shared).toHaveLength(1);
	expect(shared[0]!.title).toBe('Tact');
	// The page they are on, without query or hash — not the build-time canonical origin,
	// which on a preview deployment would share a page they are not looking at.
	expect(shared[0]!.url).toBe(`${new URL(page.url()).origin}/glossary/tact`);
});

test('falls back to the clipboard where there is not', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.addInitScript(() => {
		// Most desktop browsers and Firefox everywhere. Deleting it is the honest
		// simulation: the component feature-detects rather than sniffing.
		Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
	});
	await page.goto('/glossary/tact');
	await page.locator('[data-share]').click();

	await expect(page.locator('[data-share]')).toHaveText('Link copied');
	const clip = await page.evaluate(() => navigator.clipboard.readText());
	expect(clip).toBe(`${new URL(page.url()).origin}/glossary/tact`);
});

test('a cancelled share does not quietly put the link on the clipboard instead', async ({
	page,
	context
}) => {
	/*
	 * Cancelling the sheet rejects with `AbortError`, which is somebody changing their
	 * mind rather than a failure. Treating it as one would leave a link they decided not
	 * to send sitting on their clipboard.
	 */
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: () => Promise.reject(new DOMException('cancelled', 'AbortError'))
		});
	});
	await page.goto('/');
	await page.evaluate(() => navigator.clipboard.writeText('untouched'));

	await page.goto('/glossary/tact');
	await page.locator('[data-share]').click();

	await expect(page.locator('[data-share]')).not.toHaveText('Link copied');
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('untouched');
});

test('every kind of content page can be passed on', async ({ page }) => {
	for (const route of [
		'/glossary/tact',
		'/scenarios/a-caregiver-asks-you-about-medication',
		'/ethics/gifts',
		'/graphs/anatomy-of-a-line-graph'
	]) {
		await page.goto(route);
		await expect(page.locator('[data-share]'), `${route} should offer sharing`).toHaveCount(1);
	}
});
