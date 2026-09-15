import { error } from '@sveltejs/kit';
import {
	ethicsCodes,
	ethicsTopicById,
	ethicsTopicList,
	termIndex
} from '$lib/content/load.js';
import { scenarioById } from '$lib/content/scenarios.js';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => ethicsTopicList.map((t) => ({ slug: t.id }));
export const prerender = true;

export const load: PageLoad = ({ params }) => {
	const topic = ethicsTopicById(params.slug);
	if (!topic) error(404, 'That ethics topic is not in this build yet.');

	// Resolved here rather than in the component so the prerendered page is complete for a
	// reader with no JavaScript and for a search engine.
	const termNames = new Map(termIndex.map((t) => [t.i, t.t]));
	const codes = topic.sectionRefs.map((ref) => {
		const code = ethicsCodes[ref.codeId];
		return {
			codeId: ref.codeId,
			shortName: code?.shortName ?? ref.codeId,
			officialUrl: code?.officialUrl ?? null,
			standardsVerified: code?.standardsVerified ?? false,
			section: ref.section,
			sectionLabel:
				code?.sections.find((s) => s.number === ref.section)?.ourLabel ??
				`Section ${ref.section}`,
			standardNumbers: ref.standardNumbers
		};
	});

	return {
		topic,
		codes,
		terms: topic.termRefs
			.filter((id) => termNames.has(id))
			.map((id) => ({ id, name: termNames.get(id)! })),
		scenarios: topic.scenarioRefs
			.map((id) => ({ id, title: scenarioById(id)?.title }))
			.filter((s): s is { id: string; title: string } => !!s.title),
		related: topic.relatedTopics
			.map((id) => ({ id, label: ethicsTopicById(id)?.ourLabel }))
			.filter((r): r is { id: string; label: string } => !!r.label)
	};
};
