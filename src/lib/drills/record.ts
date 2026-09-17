import type { DrillAttempt } from '$lib/db/index.js';
import type { PairQuestion } from './pairs.js';

/**
 * What a finished drill sitting is worth keeping.
 *
 * A summary and the confusions, never a row per item: the items are regenerated on every
 * build, so their ids would be a record of nothing.
 *
 * Separate from the module that writes it because that one imports `$app/environment`,
 * which does not exist outside a SvelteKit build — and the mapping below is the part with
 * decisions in it, so it is the part that has to be testable.
 */

/** The key a confusion is stored under: the two term ids, sorted. */
export const pairKey = (question: PairQuestion): string =>
	[...question.options].sort().join('|');

export interface FinishedSitting {
	startedAt: number;
	questions: readonly PairQuestion[];
	missed: readonly PairQuestion[];
	categories: readonly string[];
}

/** The record a sitting becomes. Pure, so it can be checked without a database. */
export function toAttempt(sitting: FinishedSitting, finishedAt: number): DrillAttempt {
	return {
		// Stamped with the start time so two sittings cannot collide, and readable in a dump,
		// which an opaque uuid is not.
		id: `pairs-${sitting.startedAt}-${sitting.questions.length}`,
		kind: 'pairs',
		startedAt: sitting.startedAt,
		finishedAt,
		total: sitting.questions.length,
		correct: sitting.questions.length - sitting.missed.length,
		categories: [...sitting.categories],
		// Deduplicated within a sitting: seeing both directions of one pair and getting both
		// wrong is one confusion met twice, not two confusions.
		missedPairs: [...new Set(sitting.missed.map(pairKey))]
	};
}

export interface FinishedObservation {
	startedAt: number;
	method: string;
	/** Intervals, taps or seconds — whatever the method gave the reader a chance to get right. */
	opportunities: number;
	/** Agreement with what actually happened, 0–100. */
	agreement: number;
}

/**
 * The record a measurement sitting becomes.
 *
 * Agreement is stored back as a count out of the opportunities rather than as a percentage,
 * so the one field pair every reader of this store already understands keeps meaning the
 * same thing. `correct / total` reproduces the agreement either way, and a store where
 * `correct` means one thing for one `kind` and something else for another is a store that
 * will be misread.
 *
 * The stream is not kept. It is a pure function of the seed, and the seed is not kept
 * either: what a reader gets from history is whether they are getting better at catching
 * behaviour, not the chance to re-litigate one two-minute session.
 */
export function toObservationAttempt(
	sitting: FinishedObservation,
	finishedAt: number
): DrillAttempt {
	const total = Math.max(1, Math.round(sitting.opportunities));
	return {
		id: `data-${sitting.startedAt}-${sitting.method}`,
		kind: 'data',
		startedAt: sitting.startedAt,
		finishedAt,
		total,
		correct: Math.round((sitting.agreement / 100) * total),
		// The method, in the field that already answers "what was this sitting drawn from".
		categories: [sitting.method],
		missedPairs: []
	};
}

export interface FinishedPlot {
	startedAt: number;
	/** Every session, plus the phase line. */
	opportunities: number;
	score: number;
}

/**
 * The record a graph sitting becomes.
 *
 * Same shape as the others and the same reason: `correct / total` has to mean "the share
 * they got right" for every kind in this store, or the one summary that reads them all is
 * reading three different things.
 */
export function toPlotAttempt(sitting: FinishedPlot, finishedAt: number): DrillAttempt {
	return {
		id: `graph-${sitting.startedAt}`,
		kind: 'graph',
		startedAt: sitting.startedAt,
		finishedAt,
		total: Math.max(1, sitting.opportunities),
		correct: sitting.score,
		categories: [],
		missedPairs: []
	};
}
