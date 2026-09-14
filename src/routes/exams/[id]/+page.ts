import { error } from '@sveltejs/kit';
import { credentials, outlines, termIndex } from '$lib/content/load.js';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => Object.keys(outlines).map((id) => ({ id }));
export const prerender = true;

export const load: PageLoad = ({ params }) => {
	const outline = outlines[params.id];
	if (!outline) error(404, 'That outline is not in this build.');

	const facts = Object.values(credentials).find((c) => c.outlineId === outline.id) ?? null;

	// Resolve term links here so the prerendered page is complete without JavaScript.
	const names = new Map(termIndex.map((t) => [t.i, t.t]));
	const termNames = Object.fromEntries(
		outline.domains.flatMap((d) =>
			d.tasks.flatMap((t) =>
				t.termRefs.filter((id) => names.has(id)).map((id) => [id, names.get(id)!])
			)
		)
	) as Record<string, string>;

	// Terms tagged to each domain, so an outline without verified tasks still links to
	// its vocabulary.
	const termsByDomain: Record<string, { id: string; name: string }[]> = {};
	for (const d of outline.domains) {
		termsByDomain[d.letter] = termIndex
			.filter((t) => t.r.some((r) => r.startsWith(`${outline.credential}:${d.letter}`)))
			.map((t) => ({ id: t.i, name: t.t }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	return { outline, facts, termNames, termsByDomain };
};
