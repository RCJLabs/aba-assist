import { describe, expect, it } from 'vitest';
import { RETRY_DOMAIN } from '$lib/quiz/retry.js';
import type { TermIndexEntry } from '@aba/content-schema';
import {
	actions,
	answersNeeded,
	coverage,
	domainStats,
	WEAK_BELOW,
	type AttemptLike,
	type DomainLike,
	type DomainStat
} from './plan.js';

const DOMAINS: DomainLike[] = [
	{ letter: 'A', name: 'Data Collection', examWeightPercent: 17, examItems: 13 },
	{ letter: 'C', name: 'Behavior Acquisition', examWeightPercent: 25, examItems: 19 },
	{ letter: 'F', name: 'Ethics', examWeightPercent: 15, examItems: 11 }
];

const term = (i: string, refs: string[]): TermIndexEntry =>
	({ i, t: i, a: [], c: 'principles', g: '', b: 1, r: refs, f: true }) as TermIndexEntry;

const TERMS = [
	term('count', ['RBT:A.1']),
	term('rate', ['RBT:A']),
	term('shaping', ['RBT:C.10']),
	term('gifts', ['RBT:F.8']),
	term('elsewhere', ['BCBA:B.2'])
];

const attempt = (perDomain: AttemptLike['perDomain'], domain = 'all'): AttemptLike => ({
	credential: 'RBT',
	domain,
	perDomain,
	missed: [],
	finishedAt: 1
});

describe('which sittings count as a measurement', () => {
	it('leaves a retry run out of the area totals', () => {
		/*
		 * A retry run is drawn entirely from questions already got wrong, so it is a harder
		 * paper than the bank by construction. Counting it would drag every area's accuracy
		 * down in proportion to how much the reader had gone back over their mistakes —
		 * the app punishing them for doing the useful thing.
		 */
		const fresh = attempt({ A: { total: 13, correct: 13 } });
		const retried = attempt({ A: { total: 13, correct: 0 } }, RETRY_DOMAIN);
		const stats = domainStats(DOMAINS, [fresh, retried], 'RBT', TERMS, new Set());
		const a = stats.find((s) => s.letter === 'A')!;
		expect(a.answered).toBe(13);
		expect(a.accuracy).toBe(1);
	});

	it('still counts an ordinary single-area run', () => {
		// The exclusion is on the retry marker alone, not on anything narrower than "all".
		const stats = domainStats(
			DOMAINS,
			[attempt({ A: { total: 13, correct: 7 } }, 'A')],
			'RBT',
			TERMS,
			new Set()
		);
		expect(stats.find((s) => s.letter === 'A')!.answered).toBe(13);
	});
});

describe('how much is enough to report', () => {
	it('asks for as many answers as the real paper asks in that area', () => {
		expect(answersNeeded(DOMAINS[0]!)).toBe(13);
		expect(answersNeeded(DOMAINS[1]!)).toBe(19);
	});

	it('withholds a percentage until there are that many', () => {
		const [a] = domainStats(
			DOMAINS,
			[attempt({ A: { total: 5, correct: 1 } })],
			'RBT',
			TERMS,
			new Set()
		);
		// One in five looks alarming and means nothing. The app says so rather than
		// reporting 20%.
		expect(a!.accuracy).toBeNull();
		expect(a!.needed).toBe(8);
		expect(a!.answered).toBe(5);
	});

	it('reports one once there are enough, adding attempts together', () => {
		const stats = domainStats(
			DOMAINS,
			[attempt({ A: { total: 8, correct: 6 } }), attempt({ A: { total: 6, correct: 3 } })],
			'RBT',
			TERMS,
			new Set()
		);
		expect(stats[0]!.answered).toBe(14);
		expect(stats[0]!.accuracy).toBeCloseTo(9 / 14, 5);
		expect(stats[0]!.needed).toBe(0);
	});

	it('ignores another credential’s attempts entirely', () => {
		const other: AttemptLike = {
			...attempt({ A: { total: 20, correct: 20 } }),
			credential: 'BCBA'
		};
		const stats = domainStats(DOMAINS, [other], 'RBT', TERMS, new Set());
		expect(stats[0]!.answered).toBe(0);
	});

	it('finds the terms in an area that have never been studied', () => {
		const stats = domainStats(DOMAINS, [], 'RBT', TERMS, new Set(['count']));
		// `count` is studied, `rate` is filed at the domain level and still counts,
		// and a BCBA-only term is not in an RBT area at all.
		expect(stats[0]!.unstudiedTerms).toEqual(['rate']);
		expect(stats[2]!.unstudiedTerms).toEqual(['gifts']);
	});
});

describe('what to do next', () => {
	const full = (correctRatio: number): DomainStat[] =>
		DOMAINS.map((d) => ({
			letter: d.letter,
			name: d.name,
			weight: d.examWeightPercent,
			answered: d.examItems!,
			correct: Math.round(d.examItems! * correctRatio),
			accuracy: correctRatio as number | null,
			needed: 0,
			unstudiedTerms: [] as string[]
		}));

	it('ranks a heavy area above a light one at the same accuracy', () => {
		const stats = full(0.5);
		const ranked = actions(stats, { dueCards: 0, simulationsSat: 1 }).filter(
			(a) => a.kind === 'drill'
		);
		// C is 25% of the paper and F is 15%, so C comes first however the scores read.
		expect(ranked.map((a) => a.letter)).toEqual(['C', 'A', 'F']);
	});

	it('prefers finding out over practising, at equal weight', () => {
		const stats = full(0.5);
		stats[1]!.weight = 15; // same share as F
		stats[2]!.accuracy = null;
		stats[2]!.answered = 0;
		stats[2]!.needed = 11;
		const ranked = actions(stats, { dueCards: 0, simulationsSat: 1 });
		const unmeasured = ranked.findIndex((a) => a.kind === 'answer-more');
		const weak = ranked.findIndex((a) => a.kind === 'drill' && a.letter === 'C');
		expect(unmeasured).toBeLessThan(weak);
	});

	it('still puts a heavy known weakness above a light unsampled area', () => {
		const stats = full(0.5);
		stats[2]!.accuracy = null; // Ethics, 15% of the paper, never sampled
		stats[2]!.answered = 0;
		stats[2]!.needed = 11;
		const first = actions(stats, { dueCards: 0, simulationsSat: 1 })[0]!;
		/*
		 * Behavior Acquisition is a quarter of the paper and demonstrably at 50%. Sending
		 * somebody to sample a fifteen-percent area first would be tidier and would waste
		 * the hour they have.
		 */
		expect(first.letter).toBe('C');
		expect(first.kind).toBe('drill');
	});

	it('puts due cards above ordinary practice', () => {
		const ranked = actions(full(0.5), { dueCards: 12, simulationsSat: 1 });
		expect(ranked[0]!.kind).toBe('review-due');
	});

	it('says nothing is weak when nothing is', () => {
		const ranked = actions(full(0.95), { dueCards: 0, simulationsSat: 1 });
		expect(ranked).toEqual([]);
	});

	it('suggests a simulation only once every area has been measured', () => {
		const measured = full(0.9);
		expect(
			actions(measured, { dueCards: 0, simulationsSat: 0 }).some((a) => a.kind === 'simulate')
		).toBe(true);

		const partial = full(0.9);
		partial[0]!.accuracy = null;
		expect(
			actions(partial, { dueCards: 0, simulationsSat: 0 }).some((a) => a.kind === 'simulate')
		).toBe(false);
	});

	it('offers terms to learn alongside practice in a weak area', () => {
		const stats = full(0.4);
		stats[1]!.unstudiedTerms = ['shaping', 'chaining'];
		const ranked = actions(stats, { dueCards: 0, simulationsSat: 1 });
		const learn = ranked.find((a) => a.kind === 'learn-terms');
		expect(learn?.letter).toBe('C');
		expect(learn?.title).toContain('2 terms');
	});

	it('uses the same weakness threshold it documents', () => {
		const justUnder = full(WEAK_BELOW - 0.01);
		const justOver = full(WEAK_BELOW + 0.01);
		expect(actions(justUnder, { dueCards: 0, simulationsSat: 1 }).length).toBeGreaterThan(0);
		expect(actions(justOver, { dueCards: 0, simulationsSat: 1 })).toEqual([]);
	});
});

describe('what can be said about the whole exam', () => {
	it('withholds an overall figure while any area is unmeasured', () => {
		const stats = domainStats(
			DOMAINS,
			[attempt({ A: { total: 13, correct: 13 }, C: { total: 19, correct: 19 } })],
			'RBT',
			TERMS,
			new Set()
		);
		const c = coverage(stats);
		expect(c.measured).toBe(2);
		expect(c.total).toBe(3);
		// Two perfect areas out of three is not "100% ready"; F has never been sampled.
		expect(c.overall).toBeNull();
	});

	it('reports one once every area has been sampled', () => {
		const stats = domainStats(
			DOMAINS,
			[
				attempt({
					A: { total: 13, correct: 10 },
					C: { total: 19, correct: 12 },
					F: { total: 11, correct: 8 }
				})
			],
			'RBT',
			TERMS,
			new Set()
		);
		const c = coverage(stats);
		expect(c.measured).toBe(3);
		expect(c.answered).toBe(43);
		expect(c.overall).toBeCloseTo(30 / 43, 5);
	});
});
