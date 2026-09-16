import { RELEASE_MINIMUM_TERMS, RELEASE_REQUIRED_KINDS } from '@aba/content-schema/runtime';
import type { ReviewItem } from './reviewable.js';

/**
 * How far the corpus is from being publishable, read from the same rules the build uses.
 *
 * The review queue used to show one number: how many entries were unreviewed. That is
 * true and useless, because it is not what stands between this app and a reader. Four
 * small kinds have to be complete before a build may call itself a release, and the
 * glossary has to clear a floor; everything else is withheld individually and grows.
 * So the queue can say what the wall actually is, which is usually a great deal smaller
 * than the backlog.
 *
 * Decisions made here have not reached the content files. They are counted separately
 * and labelled as pending, because a build reads the files and nothing else.
 */

export interface Requirement {
	id: string;
	label: string;
	total: number;
	/** Approved in the content files, which is what the build reads. */
	approved: number;
	/** Decided here and not yet exported and applied. */
	pending: number;
	remaining: number;
}

export interface Floor {
	label: string;
	needed: number;
	approved: number;
	pending: number;
	remaining: number;
}

export interface Gate {
	requirements: Requirement[];
	floor: Floor;
	/** Entries still to approve before a release build is possible. */
	remaining: number;
	/** True once the files themselves would pass. Pending decisions do not count. */
	met: boolean;
	/** True if applying the pending decisions would make it pass. */
	metAfterExport: boolean;
}

type Decisions = Record<string, { decision: string } | undefined>;

const isApproved = (item: ReviewItem) => item.status === 'approved';
const isPending = (item: ReviewItem, decisions: Decisions) =>
	!isApproved(item) && decisions[item.id]?.decision === 'approved';

function tally(items: ReviewItem[], decisions: Decisions) {
	const approved = items.filter(isApproved).length;
	const pending = items.filter((i) => isPending(i, decisions)).length;
	return { total: items.length, approved, pending, remaining: items.length - approved };
}

export function gateFor(items: ReviewItem[], decisions: Decisions = {}): Gate {
	const requirements: Requirement[] = RELEASE_REQUIRED_KINDS.map(({ id, label }) => {
		const group = items.filter((i) => i.gate === id);
		return { id, label, ...tally(group, decisions) };
	});

	const terms = items.filter((i) => i.kind === 'term');
	const approvedTerms = terms.filter(isApproved).length;
	const pendingTerms = terms.filter((i) => isPending(i, decisions)).length;
	const floor: Floor = {
		label: 'Approved glossary terms',
		needed: RELEASE_MINIMUM_TERMS,
		approved: approvedTerms,
		pending: pendingTerms,
		remaining: Math.max(0, RELEASE_MINIMUM_TERMS - approvedTerms)
	};

	const remaining = requirements.reduce((n, r) => n + r.remaining, 0) + floor.remaining;
	const met = remaining === 0;

	// What the next export would buy, which is the number worth working towards in a
	// sitting: decisions here change nothing until they are applied in the repository.
	const afterExport =
		requirements.reduce((n, r) => n + Math.max(0, r.remaining - r.pending), 0) +
		Math.max(0, RELEASE_MINIMUM_TERMS - approvedTerms - pendingTerms);

	return { requirements, floor, remaining, met, metAfterExport: afterExport === 0 };
}

/** Items the gate is waiting on, so the queue can offer them first. */
export function gatesRelease(item: ReviewItem): boolean {
	return item.gate !== null;
}

/**
 * Which 150 terms, of the 259 there are.
 *
 * The floor is a number, not a list, so a reviewer clearing the four required kinds is
 * then told "150 terms" and left to pick them. Picking badly is easy and expensive: a
 * launch glossary missing the terms the questions and situations cite is a glossary whose
 * own cross-references go nowhere, which is exactly the thinness the floor exists to
 * prevent.
 *
 * So the set is the terms the rest of the corpus leans on hardest, counted rather than
 * chosen: every question, situation, ethics topic, graph, practice guide and task-list
 * entry that names a term is one inbound reference, and so is every cross-reference from
 * another term. Ranked by that, ties broken by id so the set is the same on every device
 * and in every build.
 *
 * This is a route to the floor, not a second gate. Approving 150 other terms clears it
 * just as well; the build reads the count and nothing else.
 */
export function launchSet(items: ReviewItem[]): Set<string> {
	const terms = items.filter((i) => i.kind === 'term');
	const ranked = [...terms].sort(
		(a, b) =>
			(b.inboundRefs ?? 0) - (a.inboundRefs ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
	);
	return new Set(ranked.slice(0, RELEASE_MINIMUM_TERMS).map((i) => i.id));
}

/**
 * Everything on the shortest honest path to a published build.
 *
 * The four required kinds, complete, plus the glossary set above. Nothing else: the other
 * 109 terms, the 603 questions and the 48 guidance situations are withheld individually
 * and can be approved at any pace afterwards.
 */
export function inLaunchSet(item: ReviewItem, set: Set<string>): boolean {
	return gatesRelease(item) || set.has(item.id);
}
