/**
 * Keeping the due count on the icon right while the app is closed.
 *
 * Imported into the generated service worker by `workbox.importScripts`. Plain ES5-ish
 * JavaScript with no build step and no imports: this file is served as-is and runs inside
 * a worker that Workbox wrote, so it cannot reach anything in `src/`.
 *
 * That is the one real cost of doing this at all, and it is worth naming. The definition
 * of "due" now exists in two places — `src/lib/study/badge.ts` for the app and here for
 * the worker — and two copies of a rule drift. They are kept to the narrowest possible
 * shared surface to make drifting hard: a count of `cards` whose `due` is at or before
 * now, taken from the `by-due` index, with no filtering of any kind. If that definition
 * ever needs to change, it changes in both, and the app's copy carries the reasoning.
 *
 * Everything here is best-effort. A browser that does not support periodic sync never
 * runs it; one that does may run it on its own schedule, or not at all, and neither is a
 * fault to report.
 */

var DB_NAME = 'aba-assist';
var REFRESH_TAG = 'aba-due-badge';
var BADGE_MAX = 99;

/**
 * Count due cards without creating or upgrading the database.
 *
 * Opening with no version against a database that does not exist yet would create an
 * empty one, and a connection left open would then block the app's own upgrade — from a
 * background task the user cannot see. So an upgrade is aborted, every path closes, and
 * "nothing to count" comes back as zero.
 */
function countDue() {
	return new Promise(function (resolve) {
		var open;
		try {
			open = indexedDB.open(DB_NAME);
		} catch {
			resolve(0);
			return;
		}
		var fresh = false;
		open.onupgradeneeded = function () {
			fresh = true;
			if (open.transaction) open.transaction.abort();
		};
		open.onerror = function () {
			resolve(0);
		};
		open.onsuccess = function () {
			var db = open.result;
			if (fresh || !db.objectStoreNames.contains('cards')) {
				db.close();
				resolve(0);
				return;
			}
			try {
				var index = db.transaction('cards').objectStore('cards').index('by-due');
				var req = index.count(IDBKeyRange.upperBound(Date.now()));
				req.onsuccess = function () {
					var n = req.result;
					db.close();
					resolve(typeof n === 'number' ? n : 0);
				};
				req.onerror = function () {
					db.close();
					resolve(0);
				};
			} catch {
				db.close();
				resolve(0);
			}
		};
	});
}

function applyBadge() {
	if (!self.navigator || typeof self.navigator.setAppBadge !== 'function') {
		return Promise.resolve();
	}
	return countDue().then(function (n) {
		/*
		 * Cleared rather than set to zero. `setAppBadge(0)` clears on some platforms and
		 * shows a bare dot on others, and a dot meaning "nothing is due" draws the eye and
		 * then wastes the trip. Same rule as the app's own `badgeValue`.
		 */
		if (n <= 0) return self.navigator.clearAppBadge();
		return self.navigator.setAppBadge(Math.min(n, BADGE_MAX));
	});
}

self.addEventListener('periodicsync', function (event) {
	if (event.tag !== REFRESH_TAG) return;
	event.waitUntil(applyBadge());
});
