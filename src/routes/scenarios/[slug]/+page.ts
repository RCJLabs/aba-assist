import { error } from '@sveltejs/kit';
import { scenarioById, scenarios } from '$lib/content/scenarios.js';
import { termIndex } from '$lib/content/load.js';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => scenarios.map((s) => ({ slug: s.id }));
export const prerender = true;

export const load: PageLoad = ({ params }) => {
	const scenario = scenarioById(params.slug);
	if (!scenario) error(404, 'That situation is not in this build yet.');

	const names = new Map(termIndex.map((t) => [t.i, t.t]));
	return {
		scenario,
		terms: scenario.termRefs
			.filter((id) => names.has(id))
			.map((id) => ({ id, name: names.get(id)! }))
	};
};
