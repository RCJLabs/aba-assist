/**
 * How closely an item has to be read before it can ship.
 *
 * Reviewing four hundred items uniformly is not a plan, it is a reason nothing gets
 * reviewed. Risk is not uniform either: a wrong gloss on "count" costs a reader a moment
 * of confusion, and a wrong line on an escalation card costs something else entirely. So
 * the queue sorts by how much it would matter to get the item wrong.
 *
 * The tier is derived from what the item is and what its prose touches, never from a
 * field somebody has to remember to set. Adding a term whose definition mentions
 * restraint moves it into the read-everything tier on the next build, with no action from
 * the author — which is the only version of this that stays true.
 */
import {
	CLINICAL_DECISION_LEXICON,
	PHYSICAL_CONTACT_LEXICON,
	RISK_LEXICON
} from '@aba/content-schema/runtime';
import { rngFor } from '$lib/rand.js';
import type { ReviewItem } from './reviewable.js';

export type ReviewTier = 'A' | 'B' | 'C';

export interface TierVerdict {
	tier: ReviewTier;
	/** Why this item landed here, shown to the reviewer so the sorting is arguable. */
	reason: string;
}

export const TIER_LABELS: Record<ReviewTier, string> = {
	A: 'Read every one',
	B: 'Read every one, this pass',
	C: 'Sampled'
};

export const TIER_NOTES: Record<ReviewTier, string> = {
	A: 'Somebody acts on these, or is held to them. Nothing here ships on anybody else’s word.',
	B: 'Wrong answers with confident explanations are the defining failure of the apps in this market. Every one gets read the first time.',
	C: 'Ordinary definitions, carried by the validator, the citations and a sample of each batch.'
};

/** Categories where a definition is also an obligation. */
const HIGH_STAKES_CATEGORIES = new Set(['ethics', 'supervision']);

/**
 * Minutes a reviewer should budget per item, by tier.
 *
 * Rough, and deliberately not optimistic. The number exists so that "456 unreviewed"
 * becomes a number of evenings rather than a wall.
 */
export const MINUTES_PER_ITEM: Record<ReviewTier, number> = { A: 3, B: 1.5, C: 0.75 };

export function tierFor(item: ReviewItem): TierVerdict {
	switch (item.kind) {
		case 'scenario':
			return { tier: 'A', reason: 'a situation somebody acts on' };
		case 'ethics-topic':
		case 'ethics-code':
			return { tier: 'A', reason: 'an obligation somebody is held to' };
		case 'credential':
			return { tier: 'A', reason: 'requirements a certification depends on' };
		case 'practice-guide':
			return { tier: 'A', reason: 'documentation guidance that touches scope' };
		case 'question':
			return { tier: 'B', reason: 'a wrong answer with a confident rationale' };
		case 'graph':
			return { tier: 'B', reason: 'a picture somebody learns to read from' };
		case 'outline':
			return { tier: 'B', reason: 'the facts every other page is filed against' };
		case 'term':
			return tierForTerm(item);
	}
}

function tierForTerm(item: ReviewItem): TierVerdict {
	const category = item.category ?? '';
	if (HIGH_STAKES_CATEGORIES.has(category)) {
		const article = /^[aeiou]/.test(category) ? 'an' : 'a';
		return {
			tier: 'A',
			reason: `${article} ${category} definition, which is also an obligation`
		};
	}

	const prose = item.fields.flatMap((f) => f.lines).join('\n');
	const risk = prose.match(RISK_LEXICON);
	if (risk) {
		return { tier: 'A', reason: `the definition mentions "${risk[0]}"` };
	}
	const clinical = prose.match(CLINICAL_DECISION_LEXICON);
	if (clinical) {
		return { tier: 'A', reason: `the definition mentions "${clinical[0]}"` };
	}
	/*
	 * An entry about putting hands on a learner is not an ordinary definition, even when
	 * it names no crisis. "Response blocking" and "hand-over-hand" carry no risk-lexicon
	 * word, so without this they would be carried by a sample of their neighbours.
	 */
	const contact = prose.match(PHYSICAL_CONTACT_LEXICON);
	if (contact) {
		return { tier: 'A', reason: `the definition mentions "${contact[0]}"` };
	}
	return { tier: 'C', reason: 'an ordinary definition' };
}

/**
 * The batch an item can be sampled within, or null where it cannot be sampled at all.
 *
 * Only the glossary is sampleable, and only its ordinary definitions. A batch is one
 * category, because that is the unit a reviewer reads in one sitting and the unit whose
 * items are alike enough for a sample to say anything about the rest.
 */
export function batchFor(item: ReviewItem): string | null {
	if (item.kind !== 'term') return null;
	if (tierFor(item).tier !== 'C') return null;
	return item.category ? `term:${item.category}` : null;
}

export interface Sample {
	batch: string;
	/** Ids drawn for reading, in queue order. */
	drawn: string[];
	/** Ids the sample would carry if every drawn item is approved. */
	carried: string[];
	/** Written into every carried item's file, so the basis is visible afterwards. */
	label: string;
}

/**
 * Draw a reproducible sample from a batch.
 *
 * Seeded by the batch id and the content version together: the same build always draws
 * the same items, and a build whose content changed draws a different sample rather than
 * re-approving the same rows a reviewer already saw. Ids are sorted first so the draw
 * does not depend on the order the loader happened to return them in.
 */
export function drawSample(
	batch: string,
	ids: string[],
	rate: number,
	contentVersion: string
): Sample {
	const sorted = [...ids].sort();
	const size = Math.min(sorted.length, Math.max(1, Math.ceil(sorted.length * rate)));
	const next = rngFor(`${batch}@${contentVersion}`);

	// Partial Fisher-Yates: shuffle only as far as the sample needs.
	const pool = [...sorted];
	const drawn: string[] = [];
	for (let i = 0; i < size; i++) {
		const j = i + Math.floor(next() * (pool.length - i));
		[pool[i], pool[j]] = [pool[j]!, pool[i]!];
		drawn.push(pool[i]!);
	}

	const drawnSet = new Set(drawn);
	return {
		batch,
		drawn,
		carried: sorted.filter((id) => !drawnSet.has(id)),
		label: `${batch}@${contentVersion}:${size}-of-${sorted.length}`
	};
}

/**
 * One draw per batch, over a whole queue.
 *
 * Lives here rather than in the state class because it is ordinary grouping over plain
 * data: nothing about it is reactive, and building a Map inside a `.svelte.ts` module
 * invites the wrong kind of Map.
 */
export function samplesFor(
	entries: readonly { id: string; batch: string | null }[],
	rate: number,
	contentVersion: string
): Map<string, Sample> {
	const byBatch = new Map<string, string[]>();
	for (const { id, batch } of entries) {
		if (!batch) continue;
		const ids = byBatch.get(batch);
		if (ids) ids.push(id);
		else byBatch.set(batch, [id]);
	}
	return new Map(
		[...byBatch].map(([batch, ids]) => [batch, drawSample(batch, ids, rate, contentVersion)])
	);
}
