/**
 * What to do next, from what the reader has already done.
 *
 * The app could already tell somebody they scored 42% in Behavior Reduction and then
 * offered them nothing to do about it. This is the missing half: the same data, read as
 * a set of next actions.
 *
 * The posture matters more than the arithmetic. A bank of a few hundred questions written
 * by one author is not a calibrated instrument, and a percentage from six answers is
 * noise wearing a number's clothes. So this reports an accuracy only where there are
 * enough answers to mean something, says plainly how many more are needed where there are
 * not, and never converts any of it into a claim about the real exam.
 */
import type { TermIndexEntry } from '@aba/content-schema';

export interface DomainLike {
	letter: string;
	name: string;
	examWeightPercent: number | null;
	examItems: number | null;
}

export interface AttemptLike {
	credential: string;
	perDomain: Record<string, { total: number; correct: number }>;
	missed: string[];
	finishedAt: number;
}

export interface DomainStat {
	letter: string;
	name: string;
	weight: number | null;
	answered: number;
	correct: number;
	/** Null until enough has been answered for a percentage to mean anything. */
	accuracy: number | null;
	/** How many more answers this app wants before it will state one. */
	needed: number;
	/** Terms in this area with no scheduling history yet. */
	unstudiedTerms: string[];
}

/**
 * The bar for stating an accuracy: as many answers as the real paper asks in that area.
 *
 * Derived rather than picked. "Enough to say something about this domain" and "as many as
 * the exam will ask you about it" are the same number, which makes the threshold arguable
 * instead of arbitrary, and it scales with the blueprint rather than being re-tuned.
 */
export function answersNeeded(domain: DomainLike): number {
	return domain.examItems ?? 10;
}

export function domainStats(
	domains: DomainLike[],
	attempts: AttemptLike[],
	credential: string,
	terms: TermIndexEntry[],
	studied: ReadonlySet<string>
): DomainStat[] {
	const mine = attempts.filter((a) => a.credential === credential);

	return domains.map((d) => {
		let answered = 0;
		let correct = 0;
		for (const a of mine) {
			const row = a.perDomain[d.letter];
			if (!row) continue;
			answered += row.total;
			correct += row.correct;
		}
		const need = answersNeeded(d);
		const prefix = `${credential}:${d.letter}`;
		return {
			letter: d.letter,
			name: d.name,
			weight: d.examWeightPercent,
			answered,
			correct,
			accuracy: answered >= need ? correct / answered : null,
			needed: Math.max(0, need - answered),
			unstudiedTerms: terms
				.filter(
					(t) =>
						t.f &&
						!studied.has(t.i) &&
						t.r.some((ref) => ref === prefix || ref.startsWith(`${prefix}.`))
				)
				.map((t) => t.i)
		};
	});
}

export type ActionKind = 'answer-more' | 'drill' | 'learn-terms' | 'review-due' | 'simulate';

export interface Action {
	kind: ActionKind;
	/** The area this is about, or null for whole-exam actions. */
	letter: string | null;
	title: string;
	detail: string;
	/** How much it would matter to fix, for ordering. Not shown. */
	weight: number;
}

/** Below this, an area is worth working on rather than maintaining. */
export const WEAK_BELOW = 0.75;

/**
 * What an unmeasured area is assumed to be worth, for ordering.
 *
 * A coin flip, because that is what no information means. Scoring it this way rather
 * than jumping it to the front keeps the ordering honest: an area worth a quarter of the
 * paper and demonstrably at 50% is a bigger problem than an unsampled area worth a
 * twentieth, and telling somebody otherwise would waste the hour they have.
 */
const UNMEASURED_ASSUMPTION = 0.5;

/** A small bump for finding out, since a measurement also removes the uncertainty. */
const INFORMATION_BONUS = 1.2;

/**
 * Ranked next actions.
 *
 * Ordered by how much the exam cares, not by how bad the number looks: an area worth a
 * quarter of the paper at 70% is a bigger problem than one worth a twentieth at 50%, and
 * a reader with an hour should spend it on the first.
 */
export function actions(
	stats: DomainStat[],
	opts: { dueCards: number; simulationsSat: number }
): Action[] {
	const out: Action[] = [];
	const share = (s: DomainStat) => (s.weight ?? 100 / Math.max(stats.length, 1)) / 100;

	for (const s of stats) {
		if (s.accuracy === null) {
			out.push({
				kind: 'answer-more',
				letter: s.letter,
				title: `Answer ${s.needed} more in ${s.name}`,
				detail:
					s.answered === 0
						? 'Nothing answered here yet, so there is nothing to report.'
						: `${s.answered} answered so far. A percentage from that many is noise.`,
				weight: share(s) * (WEAK_BELOW - UNMEASURED_ASSUMPTION) * 4 * INFORMATION_BONUS
			});
			continue;
		}
		if (s.accuracy < WEAK_BELOW) {
			out.push({
				kind: 'drill',
				letter: s.letter,
				title: `Practise ${s.name}`,
				detail: `${Math.round(s.accuracy * 100)}% over ${s.answered} answers, and it is worth ${s.weight ?? '?'}% of the paper.`,
				weight: share(s) * (WEAK_BELOW - s.accuracy) * 4
			});
			if (s.unstudiedTerms.length > 0) {
				out.push({
					kind: 'learn-terms',
					letter: s.letter,
					title: `Learn ${s.unstudiedTerms.length} terms from ${s.name}`,
					detail: 'Flashcards for the terms in this area you have not seen yet.',
					weight: share(s) * (WEAK_BELOW - s.accuracy) * 3
				});
			}
		}
	}

	if (opts.dueCards > 0) {
		out.push({
			kind: 'review-due',
			letter: null,
			title: `${opts.dueCards} cards due`,
			detail: 'Due cards first: a card reviewed late is a card half forgotten.',
			// Above everything except a total blank, because the scheduling only works if
			// the due queue is actually cleared.
			weight: 0.9
		});
	}

	const complete = stats.every((s) => s.accuracy !== null);
	if (complete && opts.simulationsSat === 0) {
		out.push({
			kind: 'simulate',
			letter: null,
			title: 'Sit a full-length simulation',
			detail: 'Every area has enough answers now. The part left to rehearse is the pace.',
			weight: 0.8
		});
	}

	return out.sort((a, b) => b.weight - a.weight);
}

export interface Coverage {
	/** Areas with enough answers to report. */
	measured: number;
	total: number;
	answered: number;
	/** Accuracy across every answer, or null while any area is still unmeasured. */
	overall: number | null;
}

/**
 * What can honestly be said about the whole exam.
 *
 * `overall` stays null until every area has been sampled properly, because an average
 * over whichever areas somebody happened to practise says more about their choice of
 * practice than about their knowledge. Even once it is a number it is an accuracy on this
 * app's questions, and the page says so — it is not a probability of passing, and nothing
 * here should be read as one.
 */
export function coverage(stats: DomainStat[]): Coverage {
	const measured = stats.filter((s) => s.accuracy !== null).length;
	const answered = stats.reduce((n, s) => n + s.answered, 0);
	const correct = stats.reduce((n, s) => n + s.correct, 0);
	return {
		measured,
		total: stats.length,
		answered,
		overall: measured === stats.length && answered > 0 ? correct / answered : null
	};
}
