import { base } from '$app/paths';
import { browser } from '$app/environment';

/**
 * Service-worker registration and update handling.
 *
 * The service worker is generated with `skipWaiting: false` on purpose: taking over
 * mid-session would swap content underneath someone who is reading — and later, mid-way
 * through a spaced-repetition review. The cost of that choice is that an installed user
 * would sit on a stale copy forever unless something tells them an update is ready, which
 * for a reference app whose selling point is that errors get corrected is not acceptable.
 * Hence the explicit prompt.
 */
class Pwa {
	/** A new version is installed and waiting to take over. */
	updateReady = $state(false);
	offlineReady = $state(false);

	/**
	 * Whether the device reports a connection.
	 *
	 * Reported, not verified, and only ever acted on in one direction. `navigator.onLine`
	 * says true for a captive portal or a router with no route to the internet, so a page
	 * that announced "you are online" on the strength of it would be wrong often enough to
	 * matter. False is the reliable half: when the device says there is no connection,
	 * there is none. So the app only ever shows the offline state, and shows nothing at
	 * all the rest of the time.
	 */
	online = $state(true);

	#waiting: ServiceWorker | null = null;

	/**
	 * Follow the device's connection state.
	 *
	 * Separate from `register`, and not conditional on it: a browser that refuses service
	 * workers still goes offline, and the reader is owed the same notice. Returns its own
	 * teardown so a caller can stop listening.
	 */
	watchConnection(): () => void {
		if (!browser) return () => {};
		this.online = navigator.onLine;
		const sync = () => (this.online = navigator.onLine);
		addEventListener('online', sync);
		addEventListener('offline', sync);
		return () => {
			removeEventListener('online', sync);
			removeEventListener('offline', sync);
		};
	}

	async register(): Promise<void> {
		if (!browser || !('serviceWorker' in navigator)) return;

		try {
			const reg = await navigator.serviceWorker.register(`${base}/sw.js`, {
				scope: `${base}/`
			});

			if (reg.active && !reg.waiting) this.offlineReady = true;
			if (reg.waiting) this.#promote(reg.waiting);

			reg.addEventListener('updatefound', () => {
				const installing = reg.installing;
				if (!installing) return;
				installing.addEventListener('statechange', () => {
					if (installing.state !== 'installed') return;
					// `controller` is null on the very first install — that is "ready offline",
					// not "update available". Getting this backwards shows an update prompt to
					// someone who just opened the app for the first time.
					if (navigator.serviceWorker.controller) this.#promote(installing);
					else this.offlineReady = true;
				});
			});

			// Another tab may have accepted the update.
			let reloading = false;
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				if (reloading) return;
				reloading = true;
				location.reload();
			});
		} catch (err) {
			// An unavailable service worker is not a reason to break the page: the app is
			// fully usable online without it, and this is exactly what happens in a browser
			// with storage blocked or in a private window.
			//
			// It is still logged. Swallowing this silently hides the difference between "this
			// browser refuses service workers" and "the registration is misconfigured", and
			// the two look identical from the outside — no offline support either way.
			console.warn('[pwa] service worker registration failed', err);
		}
	}

	#promote(worker: ServiceWorker): void {
		this.#waiting = worker;
		this.updateReady = true;
	}

	/** Accept the waiting update. The controllerchange handler reloads the page. */
	applyUpdate(): void {
		this.#waiting?.postMessage({ type: 'SKIP_WAITING' });
		this.updateReady = false;
	}
}

export const pwa = new Pwa();
