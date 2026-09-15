/**
 * MiniSearch configuration — THE SINGLE SOURCE OF TRUTH.
 *
 * Imported by both the build-time index compiler and the client that calls
 * `MiniSearch.loadJSON`. These must agree exactly: `loadJSON` does not validate that the
 * options it is handed match the ones the index was built with, so a divergence here
 * produces silently wrong search results rather than an error. Never inline a copy.
 *
 * Returned from a factory rather than exported as a frozen constant, because MiniSearch
 * mutates the options object it is given.
 */
export interface AbaSearchOptions {
	idField: string;
	fields: string[];
	storeFields: string[];
	searchOptions: {
		boost: Record<string, number>;
		prefix: boolean;
		fuzzy: number;
		boostDocument: (id: unknown, term: string, stored?: Record<string, unknown>) => number;
	};
}

/**
 * `body` is every kind's prose folded into one field — a term's definitions, a situation's
 * setup, a topic's summary. One field rather than one per kind, because MiniSearch scores
 * per field and a term would otherwise be competing against itself across two of them
 * while a situation matched in only one.
 */
export const SEARCH_FIELDS = ['t', 'a', 'g', 'body'];

export function searchOptions(): AbaSearchOptions {
	return {
		// One id space across every kind: a term and a situation can share a slug.
		idField: 'id',
		fields: [...SEARCH_FIELDS],
		/*
		 * Enough to render a row and to filter it, and nothing else — never the body text,
		 * which is indexed for matching and then thrown away.
		 *
		 * Filtering fields (`c`, `r`) ride along here rather than in a second eagerly-loaded
		 * file. A separate document list would have to ship on every page load to be useful
		 * before this index arrives, and at 400 rows that is more bytes than the whole
		 * glossary index the instant fallback already uses.
		 */
		storeFields: ['i', 'k', 't', 'l', 'g', 'b', 'c', 'r', 'p'],
		searchOptions: {
			boost: { t: 4, a: 3, g: 2 },
			prefix: true,
			fuzzy: 0.2,
			/*
			 * Rank by the weight the build computed, so an exam task never outranks the
			 * glossary entry that explains it. Stored on the document rather than derived
			 * here, because the same weighting has to apply to the substring fallback that
			 * answers before this index has loaded.
			 */
			boostDocument: (_id: unknown, _term: string, stored?: Record<string, unknown>) =>
				typeof stored?.b === 'number' ? stored.b : 1
		}
	};
}
