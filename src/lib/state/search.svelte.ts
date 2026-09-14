import type MiniSearchType from 'minisearch';
import { searchOptions } from '@aba/content-schema';
import { termIndex } from '$lib/content/load.js';

export interface SearchHit {
	id: string;
	term: string;
	category: string;
	gloss: string;
	/** True while the fuzzy index is still loading and results come from the fallback. */
	approximate: boolean;
}

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'failed';

const MIN_QUERY = 2;
const MAX_HITS = 25;

/**
 * Search, in three tiers.
 *
 * 1. **Idle** — nothing loaded. Typing is answered immediately by a substring scan over
 *    the lightweight index, which is already in memory. This matters more than it sounds:
 *    for an RBT, looking something up often happens in unpaid time between sessions, so a
 *    search box that blocks on a network fetch or on parsing an index simply will not be
 *    used.
 * 2. **Loading** — the MiniSearch module and the prebuilt index are fetched on search
 *    intent (focus or first keystroke), not at first paint. `loadJSAsync` deserialises in
 *    batches so a low-end phone does not drop frames.
 * 3. **Ready** — fuzzy, prefix and alias-aware ranking takes over. Results swap in
 *    silently; the reader only notices that matches got better.
 */
class Search {
	query = $state('');
	status = $state<SearchStatus>('idle');

	#engine: MiniSearchType<unknown> | null = null;
	#warming: Promise<void> | null = null;

	/** Kick off loading. Safe to call repeatedly — the work happens once. */
	warm(): Promise<void> {
		if (this.#warming) return this.#warming;
		this.status = 'loading';

		this.#warming = (async () => {
			try {
				const [{ default: MiniSearch }, indexModule] = await Promise.all([
					import('minisearch'),
					import('$lib/content/generated/search-index.json')
				]);
				const serialized = (indexModule.default ?? indexModule) as object;
				this.#engine = await MiniSearch.loadJSAsync(
					serialized as never,
					searchOptions() as never
				);
				this.status = 'ready';
			} catch {
				// Never let a search failure break the page: the substring fallback still
				// answers every query, just without fuzzy matching.
				this.status = 'failed';
			}
		})();

		return this.#warming;
	}

	get results(): SearchHit[] {
		/*
		 * Read `status` FIRST, unconditionally.
		 *
		 * This getter is consumed through `$derived`, so Svelte's dependency set is
		 * whatever it actually reads during evaluation. Writing the guard as
		 * `this.#engine && this.status === 'ready'` short-circuits while the index is
		 * loading — `#engine` is null, so `status` is never read, so it is never tracked,
		 * so the handover to fuzzy search never invalidates the derived. Results would
		 * then stay stuck on the fallback until the reader happened to type another
		 * character.
		 *
		 * `#engine` itself is a plain field and deliberately not reactive; `status` is the
		 * single reactive signal for the whole lifecycle.
		 */
		const ready = this.status === 'ready';
		const q = this.query.trim();
		if (q.length < MIN_QUERY) return [];

		if (ready && this.#engine) {
			return this.#engine
				.search(q)
				.slice(0, MAX_HITS)
				.map((r) => ({
					id: String(r.id),
					term: String(r.t),
					category: String(r.c),
					gloss: String(r.g),
					approximate: false
				}));
		}

		return this.#fallback(q);
	}

	/** Substring scan over the already-loaded index. Ordered by the authored boost. */
	#fallback(query: string): SearchHit[] {
		const q = query.toLowerCase();
		return termIndex
			.filter(
				(t) =>
					t.t.toLowerCase().includes(q) ||
					t.g.toLowerCase().includes(q) ||
					t.a.some((a) => a.toLowerCase().includes(q))
			)
			.sort((a, b) => b.b - a.b || a.t.localeCompare(b.t))
			.slice(0, MAX_HITS)
			.map((t) => ({
				id: t.i,
				term: t.t,
				category: t.c,
				gloss: t.g,
				approximate: true
			}));
	}

	clear(): void {
		this.query = '';
	}
}

export const search = new Search();
