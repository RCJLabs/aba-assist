import { expect, test } from '@playwright/test';

/**
 * Installability, asserted here because Lighthouse no longer asserts it anywhere.
 *
 * The build plan makes "PWA installable" a gate on every milestone, and that gate used to
 * be one line of Lighthouse config. Lighthouse 12 removed the PWA category and every
 * manifest and service-worker audit with it, so there is now nothing in that tool to
 * assert against — and a gate that silently stopped being checked is worse than one that
 * was never written down.
 *
 * So these are Chrome's own installability criteria, checked directly: a manifest with a
 * name, a display mode that opens outside the browser, icons at both sizes Android asks
 * for, a start URL inside the scope, and a service worker that actually takes control.
 */

test('the manifest meets the criteria a browser installs against', async ({ page }) => {
	await page.goto('/');

	const manifest = await page.evaluate(async () => {
		const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]');
		if (!link) throw new Error('no manifest link — the app would not be installable');
		const res = await fetch(link.href);
		return {
			href: link.href,
			body: (await res.json()) as Record<string, unknown>,
			ok: res.ok
		};
	});

	expect(manifest.ok).toBe(true);
	const m = manifest.body;

	expect(m.name || m.short_name, 'a manifest needs a name').toBeTruthy();
	expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(m.display);

	// start_url and scope are derived from the base path rather than hardcoded, which is
	// the thing that breaks when the app moves to its own domain.
	const base = new URL(manifest.href);
	expect(String(m.start_url ?? '')).toBeTruthy();
	const start = new URL(String(m.start_url), base);
	const scope = new URL(String(m.scope ?? './'), base);
	expect(start.href.startsWith(scope.href)).toBe(true);

	const icons = (m.icons ?? []) as { src: string; sizes: string; purpose?: string }[];
	const sizes = icons.flatMap((i) => i.sizes.split(' ').map((s) => Number(s.split('x')[0])));
	expect(Math.max(...sizes), 'Android needs a 512px icon').toBeGreaterThanOrEqual(512);
	expect(
		sizes.some((s) => s >= 192),
		'Android needs a 192px icon'
	).toBe(true);
	// A maskable icon is what stops the launcher drawing a white box round the logo.
	expect(icons.some((i) => (i.purpose ?? '').includes('maskable'))).toBe(true);

	// Every icon has to actually be there. A 404 here is invisible until install time.
	for (const icon of icons) {
		const res = await page.request.get(new URL(icon.src, base).href);
		expect(res.status(), icon.src).toBe(200);
	}
});

test('a service worker registers and takes control', async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => navigator.serviceWorker.ready);

	// Controlling the page is the part that matters: a worker that installs but never
	// controls gives no offline behaviour and does not satisfy installability.
	await page.reload();
	await expect
		.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 })
		.toBe(true);

	const scope = await page.evaluate(async () => {
		const reg = await navigator.serviceWorker.getRegistration();
		return reg?.scope ?? null;
	});
	expect(scope).toBeTruthy();
	expect(page.url().startsWith(scope!)).toBe(true);
});
