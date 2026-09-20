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
 * then told "150 terms" and left to pick them. Picking badly is easy and expensive, and
 * the first version of this picked badly in a way worth recording, because it looked
 * right: it ranked every term by how many other entries cite it and took the top 150.
 *
 * Counting what that produced showed the flaw. The RBT outline's 43 tasks name 141
 * distinct terms between them, and **27 of those fell outside the top 150** — among them
 * forward chaining, backward chaining, total-task chaining, error correction,
 * least-to-most and most-to-least prompting, scatterplot and the three-term contingency.
 * Not obscure: core technician vocabulary. Meanwhile 34 terms made the set on the
 * strength of BCBA question citations alone. A pure citation count has no opinion about
 * credentials, and this corpus has three of them, the largest of which cites nearly
 * every term there is.
 *
 * A build in that state is not merely thin. References into a withheld entry are pruned
 * rather than left dangling, so the RBT outline would have shipped complete and approved
 * with a quarter of its task links quietly removed — on the outline this app's whole
 * claim rests on.
 *
 * So the set is built in the order the gate actually cares about: first the terms an
 * escalation card or the launch outline names, because those pages ship whole and a
 * pruned link in them is a hole; then the rest of the ranking, to the floor. Ties inside
 * either group break by id, so the set is identical on every device and in every build.
 *
 * This is a route to the floor, not a second gate. Approving 150 other terms clears it
 * just as well; the build reads the count and nothing else.
 */
export function launchSet(items: ReviewItem[]): Set<string> {
	const terms = items.filter((i) => i.kind === 'term');
	const byRank = (a: ReviewItem, b: ReviewItem) =>
		(b.inboundRefs ?? 0) - (a.inboundRefs ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

	/*
	 * Ranked within each group as well as between them. If the required kinds ever name
	 * more terms than the floor allows, the set is truncated — and it should keep the
	 * most-cited of them rather than whichever sorted first.
	 */
	const needed = terms.filter((t) => t.neededByGate).sort(byRank);
	const rest = terms.filter((t) => !t.neededByGate).sort(byRank);
	return new Set([...needed, ...rest].slice(0, RELEASE_MINIMUM_TERMS).map((i) => i.id));
}

/**
 * Everything on the shortest honest path to a published build.
 *
 * The four required kinds, complete, plus the glossary set above. Nothing else: the terms
 * outside the set, the questions and the guidance situations are withheld individually and
 * can be approved at any pace afterwards. Counts are deliberately absent here — they were
 * written down once and were wrong within two commits of the corpus growing.
 */
export function inLaunchSet(item: ReviewItem, set: Set<string>): boolean {
	return gatesRelease(item) || set.has(item.id);
}
