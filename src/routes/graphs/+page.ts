import { graphList } from '$lib/content/corpus.js';
import type { PageLoad } from './$types';

export const prerender = true;

export const load: PageLoad = () => ({
	graphs: graphList.map((g) => ({
		id: g.id,
		title: g.title,
		gloss: g.gloss,
		design: g.design,
		plainSummary: g.plainSummary
	}))
});
