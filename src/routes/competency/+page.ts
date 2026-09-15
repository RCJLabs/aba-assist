import { competencyFor } from '$lib/content/corpus.js';
import { termIndex } from '$lib/content/load.js';
import type { PageLoad } from './$types';

export const prerender = true;

export const load: PageLoad = () => {
	const assessment = competencyFor('RBT');
	// Term names for the links, so the page does not pull whole term buckets to render
	// a list of labels.
	const names = Object.fromEntries(termIndex.map((t) => [t.i, t.t]));
	return { assessment, names };
};
