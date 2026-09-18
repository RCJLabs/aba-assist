/**
 * Noticing that data was here and is not any more.
 *
 * The documented failure this app was built against: Safari and iOS clear a non-installed
 * site's storage after about a week of inactivity. For spaced repetition that is exactly
 * backwards — the reader who studies once a week is who the scheduling is for, and who
 * loses it. Settings has warned about that from the start.
 *
 * What nothing did was notice afterwards. A reader whose deck was cleared opened `/study`
 * and read "nothing to review yet", opened `/progress` and read "no finished sittings
 * yet" — the same words a new reader sees. The app that lost a year of supervision
 * records said nothing about it and offered no restore, which is the difference between
 * an app with a known limitation and an app that looks broken.
 *
 * **What this can and cannot catch, stated plainly, because the limit is severe.**
 *
 * WebKit's cap covers *all* script-writable storage together — localStorage, IndexedDB,
 * the Cache API and service worker registrations go in one sweep. So a witness kept in
 * localStorage cannot survive the eviction it exists to witness, and the canonical Safari
 * case is undetectable from inside the origin by any means available here. That case is
 * handled the only way it can be: by saying in Settings, before it happens, that this
 * browser will do it.
 *
 * What the witness does catch is every loss that takes IndexedDB and leaves the rest:
 * quota eviction under storage pressure, a clear of site data that misses localStorage,
 * and a migration that completes and leaves empty stores. The last one is the reason this
 * is worth having regardless of browsers — the migration ladder is this app's own code,
 * and a bug there presents to a reader as exactly the same silence.
 */

/** The last time the app saw a database with something in it. */
export interface Witness {
	seenAt: number;
}

export type DataState =
	/** Storage could not be read at all, so nothing can be concluded. */
	| 'unknown'
	/** No witness and no data: an ordinary first visit. */
	| 'fresh'
	/** Data is here. The witness is refreshed. */
	| 'present'
	/** Data is here but was never witnessed — the first run after this shipped. */
	| 'unwitnessed'
	/** A witness says there was data, and there is none now. */
	| 'cleared';

export const WITNESS_KEY = 'aba-assist:data-witness';

/**
 * A stored witness, if it is one.
 *
 * Anything unparseable or malformed reads as absent rather than as a loss. Claiming
 * somebody's data was wiped on the strength of a corrupt value would be the worst
 * possible false positive: it sends a reader looking for a backup they never needed and
 * teaches them the app cries wolf.
 */
export function parseWitness(raw: string | null): Witness | null {
	if (!raw) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null) return null;
	const { seenAt } = parsed as { seenAt?: unknown };
	if (typeof seenAt !== 'number' || !Number.isFinite(seenAt) || seenAt <= 0) return null;
	return { seenAt };
}

export function serialiseWitness(w: Witness): string {
	return JSON.stringify({ seenAt: w.seenAt });
}

/**
 * What the two facts together mean.
 *
 * `hasData` is null where the database could not be opened — blocked storage, a private
 * window, a browser refusing IndexedDB. That is emphatically not "the data is gone": the
 * data may be sitting there untouched behind a door this session cannot open, and telling
 * somebody it was cleared would be both wrong and alarming.
 */
export function assess(witness: Witness | null, hasData: boolean | null): DataState {
	if (hasData === null) return 'unknown';
	if (hasData) return witness === null ? 'unwitnessed' : 'present';
	return witness === null ? 'fresh' : 'cleared';
}

/** Whole days between the last sighting and now, never negative. */
export function daysSinceSeen(witness: Witness, now: number): number {
	return Math.max(0, Math.floor((now - witness.seenAt) / 86_400_000));
}
