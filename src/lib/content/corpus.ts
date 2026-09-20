/**
 * The corpora that ship eagerly, kept out of the module every page imports.
 *
 * Ethics, graphs, practice guides and credential facts are each small enough to load in
 * one piece, and a reader who opens one usually opens another. What they are not is small
 * together: while they sat in `load.ts` beside the search index, importing `termIndex` to
 * render the home page pulled all four plus everything they reach. A Lighthouse run put
 * the cost at four hundred and fifty kilobytes of script on a page that is a search box.
 *
 * So the split is by load shape rather than by subject. `load.ts` holds what every page
 * needs; this holds what particular pages need.
 */
import type {
	CompetencyAssessment,
	EthicsCode,
	EthicsTopic,
	GraphDoc,
	PracticeGuide
} from '@aba/content-schema';
import competencyData from './generated/competency.json';
import ethicsCodeData from './generated/ethics-codes.json';
import ethicsTopicData from './generated/ethics-topics.json';
import practiceGuideData from './generated/practice-guides.json';
import graphData from './generated/graphs.json';

// ---------------------------------------------------- credential facts

/*
 * Re-exported from their own module rather than defined here. Anything that needs only
 * the credential facts — the tracker, the quiz headings — should import
 * `$lib/content/credentials.js` directly and not attach this barrel's other 200KB. These
 * exports exist so the pages that do want the whole corpus are unchanged.
 */
export { credentials, credentialFacts, CREDENTIAL_LABELS } from './credentials.js';

// -------------------------------------------------------- practice guides

/**
 * The documentation aids. Two small documents opened together, so they ship in the main
 * chunk rather than as a lazy import — the whole file is smaller than one term page.
 */
export const practiceGuides = practiceGuideData as unknown as Record<string, PracticeGuide>;

export const practiceGuideList: PracticeGuide[] = Object.values(practiceGuides);

export function practiceGuideById(id: string): PracticeGuide | undefined {
	return practiceGuides[id];
}

// ----------------------------------------------------------------- graphs

/**
 * The graphs, eager like the practice guides: six documents of a few kilobytes each,
 * and the index page renders every one of them as a thumbnail.
 */
export const graphs = graphData as unknown as Record<string, GraphDoc>;

export const graphList: GraphDoc[] = Object.values(graphs);

export function graphById(id: string): GraphDoc | undefined {
	return graphs[id];
}

// ------------------------------------------------------------------ ethics

/**
 * The ethics reference, imported eagerly. Both codes and all topics together are a few
 * tens of kilobytes — smaller than one category of the glossary — and someone reading one
 * ethics topic almost always reads another, so there is nothing to gain from splitting it.
 */
export const ethicsCodes = ethicsCodeData as unknown as Record<string, EthicsCode>;
export const ethicsTopics = ethicsTopicData as unknown as Record<string, EthicsTopic>;

export const ethicsTopicList: EthicsTopic[] = Object.values(ethicsTopics);

export function ethicsTopicById(id: string): EthicsTopic | undefined {
	return ethicsTopics[id];
}

/** Topics that bind a given credential, in the order they are authored under each code. */
export function topicsForCredential(credential: string | null): EthicsTopic[] {
	if (!credential) return ethicsTopicList;
	return ethicsTopicList.filter((t) => t.appliesTo.includes(credential as never));
}

/** Topics grouped by the section they sit under, for one code. */
export function topicsBySection(codeId: string, credential: string | null) {
	const code = ethicsCodes[codeId];
	if (!code) return [];
	const pool = topicsForCredential(credential);
	return code.sections.map((section) => ({
		section,
		topics: pool.filter((t) =>
			t.sectionRefs.some((r) => r.codeId === codeId && r.section === section.number)
		)
	}));
}

/**
 * Competency assessments — the performance half of a credential.
 *
 * In `corpus.ts` rather than `load.ts` because only the competency page needs it, and
 * `load.ts` is what every page pays for.
 */
export const competencyList = Object.values(
	competencyData as unknown as Record<string, CompetencyAssessment>
);

export const competencyFor = (credential: string): CompetencyAssessment | undefined =>
	competencyList.find((c) => c.credential === credential);
