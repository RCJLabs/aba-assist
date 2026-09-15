import type {
	ContentOutline,
	CredentialFacts,
	EthicsCode,
	EthicsTopic,
	PracticeGuide,
	QuizQuestion,
	Term,
	TermIndexEntry
} from '@aba/content-schema';
import index from './generated/terms.index.json';
import version from './generated/version.json';
import taxonomy from './generated/taxonomy.json';
import credentialData from './generated/credentials.json';
import ethicsCodeData from './generated/ethics-codes.json';
import ethicsTopicData from './generated/ethics-topics.json';
import practiceGuideData from './generated/practice-guides.json';

export const termIndex = index as TermIndexEntry[];
export const contentVersion = version as {
	contentVersion: string;
	channel: string;
	counts: Record<string, number>;
};

/**
 * Category buckets as real Vite chunks — hashed, immutable-cacheable, and picked up by
 * the service-worker precache automatically.
 *
 * Sharding by category rather than per-term: 600 individual files would mean a 600-entry
 * precache manifest and 600 requests to warm the offline pack, while a single monolith
 * would mean shipping the whole corpus on the first client-side navigation. Sibling terms
 * in a category are also what a reader opens next, so bucket locality is a cache win.
 */
const buckets = import.meta.glob<Record<string, Term>>('./generated/terms.*.json');

const cache = new Map<string, Record<string, Term>>();

function bucketKey(category: string): string {
	return `./generated/terms.${category}.json`;
}

export async function loadTermBucket(category: string): Promise<Record<string, Term>> {
	const cached = cache.get(category);
	if (cached) return cached;

	const loader = buckets[bucketKey(category)];
	if (!loader) return {};

	// The glob loader yields the module namespace; the JSON body is on `default`.
	const mod = (await loader()) as unknown as {
		default?: Record<string, Term>;
	} & Record<string, Term>;
	const value: Record<string, Term> = mod.default ?? mod;
	cache.set(category, value);
	return value;
}

export async function loadTerm(id: string): Promise<Term | undefined> {
	const entry = termIndex.find((t) => t.i === id);
	if (!entry) return undefined;
	const bucket = await loadTermBucket(entry.c);
	return bucket[id];
}

export function termsByCategory(
	entries: TermIndexEntry[] = termIndex
): Map<string, TermIndexEntry[]> {
	const map = new Map<string, TermIndexEntry[]>();
	for (const t of entries) {
		const list = map.get(t.c) ?? [];
		list.push(t);
		map.set(t.c, list);
	}
	for (const list of map.values()) list.sort((a, b) => a.t.localeCompare(b.t));
	return map;
}

export const CATEGORY_LABELS: Record<string, string> = {
	philosophy: 'Philosophy',
	principles: 'Principles',
	measurement: 'Measurement',
	graphing: 'Graphing',
	assessment: 'Assessment',
	acquisition: 'Skill acquisition',
	reduction: 'Behavior reduction',
	'verbal-behavior': 'Verbal behavior',
	ethics: 'Ethics',
	supervision: 'Supervision',
	documentation: 'Documentation',
	'research-design': 'Research design'
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS);

// --------------------------------------------------------------- taxonomy

/**
 * The content outlines, keyed by id. Small enough (two documents) to import eagerly:
 * the domain filter needs the domain list on every page that has the filter.
 */
export const outlines = taxonomy as unknown as Record<string, ContentOutline>;

export function outlineForCredential(credential: string): ContentOutline | undefined {
	return Object.values(outlines).find((o) => o.credential === credential);
}

export const CREDENTIAL_LABELS: Record<string, string> = {
	RBT: 'Registered Behavior Technician',
	BCaBA: 'Board Certified Assistant Behavior Analyst',
	BCBA: 'Board Certified Behavior Analyst'
};

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

// ------------------------------------------------------------ credentials

export const credentials = credentialData as unknown as Record<string, CredentialFacts>;

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

// -------------------------------------------------------------- questions

const questionBuckets = import.meta.glob<QuizQuestion[]>('./generated/questions.*.json');
const questionCache = new Map<string, QuizQuestion[]>();

/** Credentials that have a question bank in this build. */
export const questionCredentials: string[] = Object.keys(questionBuckets)
	.map((k) => /questions\.([A-Za-z]+)\.json$/.exec(k)?.[1])
	.filter((x): x is string => !!x)
	.sort();

/** The bank for one exam, loaded when a session starts rather than at first paint. */
export async function loadQuestions(credential: string): Promise<QuizQuestion[]> {
	const cached = questionCache.get(credential);
	if (cached) return cached;
	const loader = questionBuckets[`./generated/questions.${credential}.json`];
	if (!loader) return [];
	const mod = (await loader()) as unknown as { default?: QuizQuestion[] } & QuizQuestion[];
	const value = (mod.default ?? mod) as QuizQuestion[];
	questionCache.set(credential, value);
	return value;
}
