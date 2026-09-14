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
	};
}

export const SEARCH_FIELDS = ['t', 'aliases', 'g', 'technical', 'plain'];

export function searchOptions(): AbaSearchOptions {
	return {
		idField: 'i',
		fields: [...SEARCH_FIELDS],
		/** Stored for rendering result rows — never full definitions, which bloat the index. */
		storeFields: ['i', 't', 'c', 'g'],
		searchOptions: {
			boost: { t: 4, aliases: 3, g: 2 },
			prefix: true,
			fuzzy: 0.2
		}
	};
}
