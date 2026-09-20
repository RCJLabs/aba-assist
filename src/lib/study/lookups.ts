/**
 * What somebody looked up, and — carefully — what that does and does not tell you.
 *
 * Every other signal in this app is produced by asking somebody a question: a quiz grades
 * an answer, a drill scores a recording, a flashcard asks for a recall. Those all cost the
 * reader something, which means they only ever measure the people willing to be tested.
 * Looking a term up costs nothing and happens anyway, so it is the one signal available
 * for the reader who never opens the quiz — which, on a free reference app people use in
 * a hallway between sessions, is most of them.
 *
 * The strong temptation is to call a repeated lookup a knowledge gap. It is not, and the
 * copy built on this must not say so:
 *
 * - A term looked up weekly may be one somebody uses constantly and double-checks a
 *   boundary condition on. Frequent contact and poor recall look identical from here.
 * - The count is confounded by the app's own shape. A term reached from six other terms'
 *   "commonly confused with" lists will be opened more than an equally shaky one nothing
 *   links to, and that is a fact about the cross-references, not the reader.
 * - Somebody else may have used the phone.
 *
 * So what is computed here is exactly what was observed — this was opened, this many
 * times, most recently then — and the decision about what it means is left to the person
 * it is about. That is the same posture as the study plan, which refuses to produce a
 * score for the same reason.
 */

export type LookupKind = 'term' | 'scenario' | 'ethics' | 'graph';

export const LOOKUP_KINDS: readonly LookupKind[] = ['term', 'scenario', 'ethics', 'graph'];

/** One content item, and how it has been opened. One row per item, not one per visit. */
export interface Lookup {
	/** `kind:slug`, because a term and a scenario may share a slug. */
	id: string;
	kind: LookupKind;
	/** The content id on its own, for linking back to the page. */
	slug: string;
	/**
	 * The heading as it was when the page was opened.
	 *
	 * Stored rather than looked up at render time, and the reason is bundle size rather
	 * than convenience. Resolving four kinds of id to four kinds of title means importing
	 * the scenario, ethics and graph corpora into every page that shows this list — the
	 * same four hundred and fifty kilobytes the corpus split was made to avoid. The page
	 * doing the recording already has the title in its hand.
	 *
	 * It also makes the list a record of what somebody read rather than of what the
	 * content currently says, which is the more honest thing for a history to be. The
	 * cost is that a renamed entry shows its old name until it is opened again, and a
	 * withdrawn one leaves a link that will not resolve.
	 */
	title: string;
	/** Separate sittings that opened it. See `SITTING_GAP_MS`. */
	count: number;
	firstAt: number;
	/**
	 * When the count last went up, which is not the same as `lastAt`.
	 *
	 * Kept apart so that the dedupe window cannot be extended indefinitely by re-reading.
	 * Deduping against `lastAt` would mean somebody who opens a page every twenty minutes
	 * all afternoon records a single lookup, because each visit would push the window
	 * forward ahead of itself.
	 */
	countedAt: number;
	lastAt: number;
}

/**
 * How long after a counted lookup another visit is still the same lookup.
 *
 * Half an hour. The case this exists for is not somebody gaming a number — nobody is
 * competing here — it is that reading a term, following its "commonly confused with" link
 * and pressing back is one act of looking something up, and counting it as two would make
 * the most cross-linked terms look like the hardest ones.
 */
export const SITTING_GAP_MS = 30 * 60_000;

/** Below this, "you have opened this more than once" is not yet a thing worth saying. */
export const REPEATED_MIN = 2;

/**
 * The most rows kept.
 *
 * The store is naturally bounded by the corpus — there are only so many pages to open —
 * so this is not a space measure at today's size. It is a limit on how long a record of
 * somebody's reading persists if the corpus grows several times over, which is the one
 * store in this app where indefinite retention is worth avoiding on its own account.
 */
export const MAX_LOOKUPS = 400;

export function lookupId(kind: LookupKind, slug: string): string {
	return `${kind}:${slug}`;
}

/**
 * The row to write for a visit, given whatever is already stored.
 *
 * Pure, and separate from the database, because the whole of the interesting behaviour is
 * here: when a visit counts and when it is the same lookup continuing.
 */
export function noteLookup(
	existing: Lookup | undefined,
	kind: LookupKind,
	slug: string,
	title: string,
	now: number
): Lookup {
	if (!existing) {
		return {
			id: lookupId(kind, slug),
			kind,
			slug,
			title,
			count: 1,
			firstAt: now,
			countedAt: now,
			lastAt: now
		};
	}
	// Clock changes, a restored backup from a device set to tomorrow, a timezone shift
	// mid-session: a visit that appears to precede the last counted one is still a visit,
	// and must not be able to make the elapsed time negative and silently stop counting.
	const elapsed = Math.max(0, now - existing.countedAt);
	const counts = elapsed >= SITTING_GAP_MS;
	return {
		...existing,
		// Freshened on every visit, so a renamed entry corrects itself the next time it is
		// opened rather than carrying its old heading for good.
		title,
		count: counts ? existing.count + 1 : existing.count,
		countedAt: counts ? now : existing.countedAt,
		lastAt: Math.max(existing.lastAt, now)
	};
}

/** Most recently opened first. The navigational view: get me back to that thing. */
export function recentLookups(rows: readonly Lookup[], limit: number): Lookup[] {
	return [...rows].sort((a, b) => b.lastAt - a.lastAt).slice(0, limit);
}

/**
 * Opened more than once, most-opened first.
 *
 * Ties break on recency rather than alphabetically: two terms opened three times each are
 * not equally live, and the one opened this week is the one worth showing first.
 */
export function repeatedLookups(
	rows: readonly Lookup[],
	limit: number,
	min = REPEATED_MIN
): Lookup[] {
	return rows
		.filter((r) => r.count >= min)
		.sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
		.slice(0, limit);
}

/**
 * Which rows to drop to get back under the cap, least recently opened first.
 *
 * By `lastAt` rather than by `count`: the cap exists to stop an old record persisting, and
 * dropping the least-used rows instead would preserve exactly the oldest ones.
 */
export function prunable(rows: readonly Lookup[], max = MAX_LOOKUPS): string[] {
	if (rows.length <= max) return [];
	return [...rows]
		.sort((a, b) => a.lastAt - b.lastAt)
		.slice(0, rows.length - max)
		.map((r) => r.id);
}
