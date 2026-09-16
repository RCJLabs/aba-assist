import { newCard, type CardRecord } from '$lib/db/scheduler.js';

/**
 * Turning a missed question into flashcard practice.
 *
 * The quiz and the flashcards were two features that did not know about each other: you
 * could get a question wrong on stimulus control every week and the scheduler would
 * never hear about it. The strongest evidence the app has about what somebody does not
 * know was being discarded at the results screen.
 *
 * What a miss buys is a place in the queue, and nothing more. The terms a missed
 * question cites become due now — a card that has never been studied is created, and one
 * scheduled three weeks out is pulled forward — but no review is logged and no grade is
 * applied. Recording a failed review the reader never sat would corrupt the scheduling
 * history with an event that did not happen, and the history is what the algorithm
 * reasons from.
 */

/**
 * How many terms one run may add.
 *
 * A bad twenty-question run can cite sixty terms, and a queue that suddenly holds sixty
 * cards is one nobody opens. The cap keeps a difficult session from turning the deck
 * into a wall, and the terms that survive it are the ones the run implicated most often.
 */
export const MAX_PER_RUN = 20;

export interface MissedQuestion {
	termRefs: string[];
}

/**
 * The terms to reinforce, most-implicated first.
 *
 * A term cited by three missed questions is better evidence than one cited by a single
 * question, so it survives the cap first. Ties keep the order the questions were asked
 * in, which is stable and needs no tie-break rule anybody has to remember.
 */
export function termsToReinforce(
	missed: MissedQuestion[],
	flashcardTerms: ReadonlySet<string>,
	limit = MAX_PER_RUN
): string[] {
	const hits = new Map<string, number>();
	for (const q of missed) {
		for (const id of q.termRefs) {
			if (!flashcardTerms.has(id)) continue;
			hits.set(id, (hits.get(id) ?? 0) + 1);
		}
	}
	return [...hits.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([id]) => id);
}

export interface ReinforcementPlan {
	/** Cards to write: newly created, and existing ones pulled forward. */
	writes: CardRecord[];
	created: number;
	pulled: number;
	/** Already due, so the run changes nothing for them. */
	untouched: number;
}

/** What to write, given the cards that already exist. Pure: no storage, no clock. */
export function planReinforcement(
	termIds: string[],
	cards: ReadonlyMap<string, CardRecord>,
	now: number
): ReinforcementPlan {
	const writes: CardRecord[] = [];
	let created = 0;
	let pulled = 0;
	let untouched = 0;

	for (const id of termIds) {
		const existing = cards.get(id);
		if (!existing) {
			writes.push(newCard(id, now));
			created++;
		} else if (existing.due > now) {
			// Only the due date moves. Stability, difficulty and the lapse count are the
			// record of reviews that actually happened, and this was not one.
			writes.push({ ...existing, due: now });
			pulled++;
		} else {
			untouched++;
		}
	}

	return { writes, created, pulled, untouched };
}
