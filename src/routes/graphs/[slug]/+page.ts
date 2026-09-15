import { error } from '@sveltejs/kit';
import { termIndex } from '$lib/content/load.js';
import { graphById, graphList } from '$lib/content/corpus.js';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => graphList.map((g) => ({ slug: g.id }));
export const prerender = true;

export const load: PageLoad = ({ params }) => {
	const graph = graphById(params.slug);
	if (!graph) error(404, 'That graph is not in this build yet.');

	// Resolved here so the prerendered page is complete without JavaScript, the same as
	// the ethics pages: a reader arriving from a search engine gets the whole thing.
	const termNames = new Map(termIndex.map((t) => [t.i, t.t]));
	const order = graphList.map((g) => g.id);
	const at = order.indexOf(graph.id);

	return {
		graph,
		terms: graph.termRefs
			.filter((id) => termNames.has(id))
			.map((id) => ({ id, name: termNames.get(id)! })),
		callouts: graph.callouts.map((c) => ({
			...c,
			termName: c.termRef ? (termNames.get(c.termRef) ?? null) : null
		})),
		prev: at > 0 ? pick(order[at - 1]!) : null,
		next: at < order.length - 1 ? pick(order[at + 1]!) : null
	};
};

function pick(id: string) {
	const g = graphById(id);
	return g ? { id: g.id, title: g.title } : null;
}
