import type { TermIndexEntry } from '@aba/content-schema';

/**
 * Lookup for use with one hand, mid-session.
 *
 * Deliberately not the app's search. MiniSearch is better at finding things, but its index
 * is fetched on first use and ranked across six content kinds, and neither is what this
 * moment needs: somebody with a learner in front of them wants the definition of the word
 * a supervisor just used, in one tap, from what is already in memory. The term index is
 * already loaded on every page and already carries the gloss, so this costs nothing to
 * load and works with the network off.
 *
 * Prefix matches rank above contained ones because a half-typed word is the normal input
 * here — three letters and a glance, not a considered query.
 */
export function quickLookup(
	index: TermIndexEntry[],
	query: string,
	limit = 6
): TermIndexEntry[] {
	const q = query.trim().toLowerCase();
	if (q.length < 2) return [];

	const scored: { entry: TermIndexEntry; rank: number }[] = [];
	for (const entry of index) {
		const names = [entry.t, ...entry.a].map((n) => n.toLowerCase());
		let rank = Infinity;
		for (const name of names) {
			if (name === q) rank = Math.min(rank, 0);
			else if (name.startsWith(q)) rank = Math.min(rank, 1);
			else if (name.includes(q)) rank = Math.min(rank, 2);
		}
		if (rank !== Infinity) scored.push({ entry, rank });
	}

	return scored
		.sort((a, b) => a.rank - b.rank || a.entry.t.localeCompare(b.entry.t))
		.slice(0, limit)
		.map((s) => s.entry);
}
