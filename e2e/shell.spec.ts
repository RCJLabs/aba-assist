import { expect, test, type Page } from '@playwright/test';

/**
 * The app shell: header, scrolling content, bottom navigation.
 *
 * The bottom nav is the app's primary navigation and it is the last item in the shell's
 * flex column, which makes it the thing that disappears when the shell is even slightly
 * taller than the viewport — and because the shell does not scroll, disappearing means
 * unreachable rather than off-screen. It has happened once, on a phone, after a theme
 * toggle. So the invariant is asserted directly, across the settings and viewport sizes
 * that squeeze the shell hardest.
 */

const PAGES = ['/', '/glossary', '/study', '/quiz', '/help', '/ethics', '/settings'];

/** Viewport sizes chosen to squeeze the shell: short, narrow, and both. */
const SIZES = [
	{ width: 412, height: 839, name: 'phone' },
	{ width: 360, height: 640, name: 'small phone' },
	{ width: 320, height: 480, name: 'smallest supported' },
	{ width: 800, height: 360, name: 'landscape' }
];

async function useDisplay(
	page: Page,
	display: { theme?: string; fontScale?: number; oneHanded?: boolean }
): Promise<void> {
	await page.addInitScript((d) => {
		try {
			localStorage.setItem('aba-assist:display', JSON.stringify(d));
		} catch {
			// Blocked storage; the defaults are a valid case to test too.
		}
	}, display);
}

/** The nav has to be on screen, and it has to be at the bottom of it. */
async function expectNavPinnedToTheBottom(page: Page): Promise<void> {
	const nav = page.getByRole('navigation', { name: 'Main' });
	await expect(nav).toBeVisible();

	const box = await nav.boundingBox();
	expect(box, 'the nav has no layout box at all').not.toBeNull();
	const viewport = page.viewportSize()!;

	expect(box!.y, 'the nav starts above the top of the viewport').toBeGreaterThanOrEqual(0);
	expect(box!.y, 'the nav starts below the bottom of the viewport').toBeLessThan(
		viewport.height
	);
	// Within a pixel of the bottom edge: a nav that merely happens to be visible because
	// the page is short is not the same as a nav pinned to the thumb zone.
	expect(
		Math.abs(box!.y + box!.height - viewport.height),
		'the nav is not sitting on the bottom edge'
	).toBeLessThanOrEqual(1);

	// And every destination in it is reachable, not just the bar it sits in.
	for (const label of ['Search', 'Terms', 'Study', 'Quiz', 'Urgent']) {
		await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
	}
}

for (const theme of ['system', 'light', 'dark']) {
	test(`the bottom nav is pinned to the viewport in ${theme} theme`, async ({ page }) => {
		await useDisplay(page, { theme });
		for (const route of PAGES) {
			await page.goto(route);
			await expect(page.locator(`:root[data-theme="${theme}"]`)).toBeAttached();
			await expectNavPinnedToTheBottom(page);
		}
	});
}

for (const size of SIZES) {
	test(`the bottom nav survives a ${size.name} viewport`, async ({ page }) => {
		await page.setViewportSize({ width: size.width, height: size.height });
		await useDisplay(page, { theme: 'light' });
		await page.goto('/study');
		await expectNavPinnedToTheBottom(page);
	});
}

test('the bottom nav survives the largest text size and one-handed mode', async ({ page }) => {
	// The combination that pushed it off a real phone: big type, a three-line preview
	// banner, and the one-handed action bar all competing for the same shell.
	await page.setViewportSize({ width: 360, height: 640 });
	await useDisplay(page, { theme: 'light', fontScale: 1.5, oneHanded: true });
	await page.goto('/study');
	await expectNavPinnedToTheBottom(page);
});

test('toggling the theme does not cost the nav', async ({ page }) => {
	await page.goto('/study');
	for (let i = 0; i < 3; i++) {
		await page.getByRole('button', { name: /^Theme:/ }).click();
		await expectNavPinnedToTheBottom(page);
	}
});

test('the shell tells the browser which palette its own controls should use', async ({
	page
}) => {
	// A select rendered by the UA in the wrong scheme is white-on-white, and it is the
	// `color-scheme` property rather than our tokens that decides.
	for (const [theme, expected] of [
		['light', 'light'],
		['dark', 'dark']
	]) {
		await useDisplay(page, { theme });
		await page.goto('/study');
		const scheme = await page.evaluate(
			() => getComputedStyle(document.documentElement).colorScheme
		);
		expect(scheme, `data-theme="${theme}"`).toBe(expected);
	}
});
