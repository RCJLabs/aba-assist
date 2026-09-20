import { expect, test, type Page } from '@playwright/test';

/**
 * The count on the app icon.
 *
 * Headless Chromium may or may not expose the Badging API, and it certainly will not
 * render an icon, so the API is replaced with a recorder before anything loads. What is
 * being tested is the app's side of the contract — that it counts the right cards, that
 * it clears rather than showing a zero, that the switch actually stops it — which is all
 * of it that this app controls.
 */

declare global {
	interface Window {
		__badge: (number | 'clear')[];
	}
}

/**
 * Record badge calls instead of making them.
 *
 * `addInitScript` runs on every navigation in the page, including reloads, so the log is
 * created once and appended to rather than reset — a fresh array per navigation would
 * silently drop everything the previous page recorded.
 */
async function recordBadge(page: Page) {
	await page.addInitScript(() => {
		window.__badge = window.__badge ?? [];
		Object.defineProperty(navigator, 'setAppBadge', {
			configurable: true,
			value: (n?: number) => {
				window.__badge.push(n ?? 0);
				return Promise.resolve();
			}
		});
		Object.defineProperty(navigator, 'clearAppBadge', {
			configurable: true,
			value: () => {
				window.__badge.push('clear');
				return Promise.resolve();
			}
		});
	});
}

/** Put cards straight into the store, with due times of our choosing. */
async function seedCards(page: Page, dueOffsets: number[]) {
	await page.evaluate(
		(offsets) =>
			new Promise<void>((resolve, reject) => {
				// No version: the app has already created the database at its own, and
				// opening with a lower one would throw. An upgrade here would mean the app
				// never ran, which is a test setup error worth failing on.
				const open = indexedDB.open('aba-assist');
				open.onupgradeneeded = () => {
					open.transaction?.abort();
					reject(new Error('the app had not created its database yet'));
				};
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const tx = db.transaction('cards', 'readwrite');
					const store = tx.objectStore('cards');
					offsets.forEach((offset, i) => {
						store.put({
							id: `seeded-${i}`,
							due: Date.now() + offset,
							stability: 1,
							difficulty: 5,
							elapsedDays: 0,
							scheduledDays: 1,
							learningSteps: 0,
							reps: 1,
							lapses: 0,
							state: 2,
							lastReview: Date.now() - 86_400_000,
							createdAt: Date.now() - 86_400_000
						});
					});
					tx.oncomplete = () => {
						db.close();
						resolve();
					};
					tx.onerror = () => {
						db.close();
						reject(tx.error);
					};
				};
			}),
		dueOffsets
	);
}

const calls = (page: Page) => page.evaluate(() => window.__badge ?? []);

/** Open once so the app creates its database at the current version. */
async function open(page: Page) {
	await page.goto('/study');
	await expect(page.locator('[data-study-status]')).toBeAttached({ timeout: 30_000 });
}

test('puts the number of due cards on the icon', async ({ page }) => {
	await recordBadge(page);
	await open(page);
	// Three due, two not.
	await seedCards(page, [-86_400_000, -3600_000, -1000, 3600_000, 86_400_000]);

	await page.reload();
	await expect.poll(() => calls(page), { timeout: 15_000 }).toContain(3);
});

test('clears the icon rather than showing a zero', async ({ page }) => {
	/*
	 * The case right after a review session, and the one a naive implementation gets
	 * wrong: `setAppBadge(0)` clears on some platforms and draws a bare dot on others,
	 * and a dot meaning "nothing is due" draws the eye and wastes the trip.
	 */
	await recordBadge(page);
	await open(page);
	await seedCards(page, [3600_000, 86_400_000]);

	await page.reload();
	await expect.poll(() => calls(page), { timeout: 15_000 }).toContain('clear');
	expect(await calls(page)).not.toContain(0);
});

test('counts every due card, not the ones a filter happens to leave in play', async ({
	page
}) => {
	/*
	 * The badge reports the work, not the browsing state. A count that changed because
	 * somebody left a category filter on last time would be reporting the filter — and
	 * the service worker, which has no access to the app's settings, could not reproduce
	 * it, so the two halves would disagree depending on which set the badge last.
	 */
	await recordBadge(page);
	await open(page);
	await seedCards(page, [-1000, -2000, -3000, -4000]);

	await page.reload();
	await expect.poll(() => calls(page), { timeout: 15_000 }).toContain(4);
});

test('updates as the app is hidden, which is the last moment it can', async ({ page }) => {
	/*
	 * On a phone `beforeunload` and `unload` are unreliable to the point of uselessness —
	 * the tab is frozen and discarded without either — so being hidden is the only
	 * closing signal that can be relied on, and whatever is left on the icon then is what
	 * the reader sees next.
	 */
	await recordBadge(page);
	await open(page);
	await page.evaluate(() => (window.__badge = []));

	await seedCards(page, [-1000, -2000]);
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'hidden'
		});
		document.dispatchEvent(new Event('visibilitychange'));
	});

	await expect.poll(() => calls(page), { timeout: 15_000 }).toContain(2);
});

test('stops entirely once the reader turns it off', async ({ page }) => {
	await recordBadge(page);
	await open(page);
	await seedCards(page, [-1000, -2000]);

	await page.goto('/settings');
	const toggle = page.getByRole('checkbox', {
		name: 'Show how many cards are due on the app icon'
	});
	await expect(toggle).toBeChecked();
	await toggle.uncheck();

	await page.evaluate(() => (window.__badge = []));
	await page.reload();
	// Given every chance to set one, and the only thing it may do is clear.
	await expect(page.locator('h1')).toBeVisible();
	await expect.poll(() => calls(page), { timeout: 15_000 }).not.toContain(2);
});

test('the background half is served and is real JavaScript', async ({ page, request }) => {
	/*
	 * The periodic-sync listener cannot be triggered from a test — the browser decides
	 * when, and only for an installed app it judges to be used enough. What can be
	 * checked is that the file the generated worker imports actually exists and parses,
	 * because an `importScripts` of a 404 or a syntax error takes the whole service
	 * worker down with it, and that would break offline for everybody.
	 */
	const res = await request.get('/badge-sw.js');
	expect(res.status()).toBe(200);
	const source = await res.text();
	expect(source).toContain('periodicsync');

	await page.goto('/');
	const parses = await page.evaluate((src) => {
		try {
			new Function(src);
			return true;
		} catch {
			return false;
		}
	}, source);
	expect(parses).toBe(true);
});
