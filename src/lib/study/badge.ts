/**
 * The number on the app icon, and an honest account of what it can do.
 *
 * Spaced repetition only works if somebody comes back, and this app has no way of asking
 * them to. There is no account, no server and no push, by design — which rules out the
 * mechanism every other review app uses. The Badging API is the one thing left that works
 * with nothing behind it: an installed app can put a count on its own icon, and the count
 * survives the app being closed.
 *
 * **What it cannot do, stated plainly, because the limit shapes the design.** A page can
 * only set the badge while it is running. Set it as the app closes and it says how many
 * cards were due at that moment — which, right after a review session, is zero. Tomorrow,
 * when twelve have come due, the icon still says nothing. The one thing that fixes that
 * without a server is periodic background sync, which re-runs a service worker on a timer
 * the browser chooses; it exists only in Chromium, only for an installed app, and only
 * once the browser decides the app is used enough. So the badge is right when the app is
 * opened, and right while closed on the platforms that allow it, and silent elsewhere.
 * There is no version of this that works everywhere, and pretending otherwise would mean
 * a number that is wrong rather than absent.
 *
 * The count is deliberately **unfiltered**: every card that is due, not the ones the
 * current glossary filter happens to put in play. Two reasons. A badge that changed
 * because somebody left a category filter on last time would be reporting the filter
 * rather than the work. And the service worker cannot reconstruct the filter — it has no
 * access to the app's settings — so a filtered badge would disagree with itself depending
 * on which side set it last, which is worse than either answer.
 */

/** The most a badge usefully says. Beyond this the platforms render "99+" anyway. */
export const BADGE_MAX = 99;

/**
 * How many cards are due, from the rawest possible view of the store.
 *
 * Takes due timestamps rather than card records so that the service worker — which reads
 * IndexedDB through the bare API and has none of the app's types — can call exactly the
 * same function over exactly the same definition. One definition, two callers, no way for
 * them to drift.
 */
export function dueCount(dueTimes: readonly number[], now: number): number {
	let n = 0;
	for (const due of dueTimes) if (due <= now) n++;
	return n;
}

/**
 * What to actually pass to `setAppBadge`, or null to clear it.
 *
 * Null rather than zero: `setAppBadge(0)` clears the badge on some platforms and shows a
 * dot on others, and a dot that means "nothing is due" is the worst of both — it draws
 * the eye and then wastes the trip.
 */
export function badgeValue(count: number): number | null {
	if (count <= 0) return null;
	return Math.min(count, BADGE_MAX);
}

/**
 * How long a periodic refresh should ask for, in milliseconds.
 *
 * Twelve hours. The browser treats this as a floor and a hint rather than a schedule —
 * Chrome decides the real cadence from how often the app is used — so asking for an hour
 * would not produce hourly updates, it would just be a wish the browser ignores. Twelve
 * hours is the shortest interval that is plausibly honoured, and for a deck whose
 * intervals are measured in days it is fine: a badge half a day stale is still the
 * difference between knowing there is work and not.
 */
export const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** The tag both the app and the service worker use to name the periodic refresh. */
export const REFRESH_TAG = 'aba-due-badge';
