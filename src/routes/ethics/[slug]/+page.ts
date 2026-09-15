import { error } from '@sveltejs/kit';
import { termIndex } from '$lib/content/load.js';
import { ethicsCodes, ethicsTopicById, ethicsTopicList } from '$lib/content/corpus.js';
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
			/*
			 * The numbers resolved to what we say they mean. A bare "Standards 1.11, 1.12"
			 * is a citation the reader has to go elsewhere to use; the label is the part
			 * that answers their question on this page. The build has already proved every
			 * one of these numbers exists in the code, so the lookup cannot come up empty.
			 */
			standards: ref.standardNumbers.map((number) => ({
				number,
				ourLabel:
					code?.sections
						.find((s) => s.number === ref.section)
						?.standards.find((st) => st.number === number)?.ourLabel ?? null
			}))
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
