import type MiniSearchType from 'minisearch';
import { routesFor, searchOptions, type IntentRoute } from '@aba/content-schema/runtime';
import type { SearchKind } from '@aba/content-schema';
import { CATEGORY_LABELS, intentRoutes, termIndex } from '$lib/content/load.js';

export interface SearchHit {
	id: string;
	kind: SearchKind;
	title: string;
	/** Short badge: "Principles", "Situation", "Ethics", "RBT exam task". */
	label: string;
	gloss: string;
	/** Term category, for the category filter. Null for every other kind. */
	category: string | null;
	/** Outline refs as "RBT:C.2", for the exam and domain filters. */
	refs: string[];
	/** Owning document, where the hit is not its own page. An outline id, for a task. */
	parent: string | null;
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
 *    the glossary index, which is already in memory. This matters more than it sounds:
 *    for an RBT, looking something up often happens in unpaid time between sessions, so a
 *    search box that blocks on a network fetch or on parsing an index simply will not be
 *    used. This tier sees glossary terms only — the full index is four hundred rows and
 *    shipping it on every page load to cover the first few hundred milliseconds would cost
 *    every reader more than it saves.
 * 2. **Loading** — the MiniSearch module and the prebuilt index are fetched on search
 *    intent (focus or first keystroke), not at first paint. `loadJSAsync` deserialises in
 *    batches so a low-end phone does not drop frames.
 * 3. **Ready** — fuzzy, prefix and alias-aware ranking over *everything*: terms,
 *    situations, ethics topics, practice guides and exam tasks. Results swap in silently;
 *    the reader only notices that matches got better and that there are more of them.
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

	/**
	 * Situations the query asks for in so many words, ahead of anything ranked.
	 *
	 * Not part of `results`, and not sorted into them. A ranked hit is the index's opinion
	 * about which words are close; this is an authored answer to a question somebody asked
	 * in the words they had — and mixing the two would mean a card that exactly answers
	 * "he is hitting his own head" could be displaced by a term whose gloss happens to say
	 * "head". The page renders them as a separate block, above.
	 *
	 * Available on the first keystroke, deliberately. The table is in the bundle rather
	 * than the fetched index, because the one lookup in this app that must not wait on the
	 * network is the one somebody does mid-incident.
	 */
	get routes(): IntentRoute[] {
		const q = this.query.trim();
		if (q.length < MIN_QUERY) return [];
		return routesFor(q, intentRoutes);
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
					id: String(r.i),
					kind: r.k as SearchKind,
					title: String(r.t),
					label: String(r.l),
					gloss: String(r.g),
					category: typeof r.c === 'string' ? r.c : null,
					refs: Array.isArray(r.r) ? (r.r as string[]) : [],
					parent: typeof r.p === 'string' ? r.p : null,
					approximate: false
				}));
		}

		return this.#fallback(q);
	}

	/** Substring scan over the glossary index. Ordered by the authored boost. */
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
				kind: 'term' as const,
				title: t.t,
				label: CATEGORY_LABELS[t.c] ?? t.c,
				gloss: t.g,
				category: t.c,
				refs: t.r,
				parent: null,
				approximate: true
			}));
	}

	clear(): void {
		this.query = '';
	}
}

export const search = new Search();
