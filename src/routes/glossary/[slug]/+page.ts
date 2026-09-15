import { error } from '@sveltejs/kit';
import { graphList, loadTerm, termIndex } from '$lib/content/load.js';
import type { EntryGenerator, PageLoad } from './$types';

/** One prerendered, indexable page per term. */
export const entries: EntryGenerator = () => termIndex.map((t) => ({ slug: t.i }));

export const prerender = true;

export const load: PageLoad = async ({ params }) => {
	const term = await loadTerm(params.slug);
	if (!term) error(404, 'That term is not in the glossary yet.');

	// Resolve cross-references to display names here rather than in the component, so the
	// prerendered HTML is complete for a reader with no JavaScript.
	const names = new Map(termIndex.map((t) => [t.i, t.t]));
	const link = (ids: string[]) =>
		ids.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)! }));

	return {
		term,
		contrastWith: link(term.contrastWith),
		seeAlso: link(term.seeAlso),
		/*
		 * Graphs that name this term.
		 *
		 * The link only exists in one direction in the content — a graph lists its terms —
		 * because maintaining both would mean two places to forget. Inverting it here costs
		 * one pass over six documents and means somebody reading the definition of "trend"
		 * is one tap from a graph that has one.
		 */
		graphs: graphList
			.filter((g) => g.termRefs.includes(term.id))
			.map((g) => ({ id: g.id, title: g.title }))
	};
};
