import {
	CATEGORY_LABELS as SCHEMA_CATEGORY_LABELS,
	CATEGORY_ORDER
} from '@aba/content-schema/runtime';
import type { ContentOutline, QuizQuestion, Term, TermIndexEntry } from '@aba/content-schema';
import index from './generated/terms.index.json';
import version from './generated/version.json';
import taxonomy from './generated/taxonomy.json';

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

/**
 * Widened to a string key on purpose.
 *
 * The schema keeps the map exhaustive over `TermCategory`, which is what stops a category
 * being added without a label. Callers here index it with a category that arrived as data
 * — from the index, from a filter, from a URL — and should not each have to narrow it.
 */
export const CATEGORY_LABELS: Record<string, string> = SCHEMA_CATEGORY_LABELS;

export const CATEGORIES: string[] = [...CATEGORY_ORDER];

// --------------------------------------------------------------- taxonomy

/**
 * The content outlines, keyed by id. Small enough (three documents) to import eagerly:
 * the domain filter needs the domain list on every page that has the filter.
 */
export const outlines = taxonomy as unknown as Record<string, ContentOutline>;

export function outlineForCredential(credential: string): ContentOutline | undefined {
	return Object.values(outlines).find((o) => o.credential === credential);
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
