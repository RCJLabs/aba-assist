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

	#waiting: ServiceWorker | null = null;

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
