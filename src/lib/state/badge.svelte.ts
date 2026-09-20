import { browser } from '$app/environment';
import { countDue } from '$lib/db/index.js';
import { badgeValue, REFRESH_INTERVAL_MS, REFRESH_TAG } from '$lib/study/badge.js';
import { settings } from './settings.svelte.js';

/**
 * Putting the due count on the app icon.
 *
 * Every call here is feature-detected and every failure is swallowed. The Badging API is
 * absent in most browsers, present-but-refused in some, and a `setAppBadge` that throws
 * must cost nobody anything — the app works identically without it, and a console full of
 * rejections on Firefox would be noise about a feature that is working as designed.
 */
class Badge {
	/** Whether this browser offers the API at all, for the settings page to say so. */
	supported = $state(false);

	init(): void {
		if (!browser) return;
		this.supported = 'setAppBadge' in navigator;
	}

	/**
	 * Recount and set, or clear.
	 *
	 * Called on load, on every return to the app, and as it is hidden. Hidden matters
	 * most: it is the last chance the page gets to leave a true number behind, and on a
	 * phone `visibilitychange` is usually the only "closing" signal that fires at all —
	 * `beforeunload` and `unload` are unreliable to the point of uselessness on mobile.
	 */
	async refresh(): Promise<void> {
		if (!browser || !('setAppBadge' in navigator)) return;
		if (!settings.dueBadge) return void this.clear();
		try {
			const value = badgeValue(await countDue());
			if (value === null) await navigator.clearAppBadge();
			else await navigator.setAppBadge(value);
		} catch {
			// Blocked storage, a browser that lists the API and refuses it, or a document
			// that went away mid-call. None of it is worth reporting.
		}
	}

	async clear(): Promise<void> {
		if (!browser || !('clearAppBadge' in navigator)) return;
		try {
			await navigator.clearAppBadge();
		} catch {
			// As above.
		}
	}

	/**
	 * Ask to be woken periodically so the badge can be right while the app is closed.
	 *
	 * The only part of this that makes the badge worth having, and the only part that is
	 * not available everywhere. Periodic background sync is Chromium-only, needs the app
	 * installed, and is granted on the browser's own judgement of how much the app is
	 * used — so every step is optional and a refusal is the expected case rather than an
	 * error. Where it is refused the badge simply stays as the last open left it.
	 */
	async watch(): Promise<void> {
		if (!browser || !('serviceWorker' in navigator)) return;
		try {
			const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
				periodicSync?: {
					register(tag: string, opts: { minInterval: number }): Promise<void>;
					unregister(tag: string): Promise<void>;
				};
			};
			if (!reg.periodicSync) return;

			if (!settings.dueBadge) {
				await reg.periodicSync.unregister(REFRESH_TAG);
				return;
			}

			// `periodic-background-sync` is not in the standard permission-name union, and
			// querying an unknown name throws rather than returning "denied".
			const status = await navigator.permissions.query({
				name: 'periodic-background-sync' as PermissionName
			});
			if (status.state !== 'granted') return;

			await reg.periodicSync.register(REFRESH_TAG, { minInterval: REFRESH_INTERVAL_MS });
		} catch {
			// Not supported, not installed, not used enough, or no service worker. All of
			// them mean the same thing here: no background refresh, and nothing to say.
		}
	}
}

export const badge = new Badge();
