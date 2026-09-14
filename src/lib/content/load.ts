import type { Term, TermIndexEntry } from '@aba/content-schema';
import index from './generated/terms.index.json';
import version from './generated/version.json';

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

export function termsByCategory(): Map<string, TermIndexEntry[]> {
	const map = new Map<string, TermIndexEntry[]>();
	for (const t of termIndex) {
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
