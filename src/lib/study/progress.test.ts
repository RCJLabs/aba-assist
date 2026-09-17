import { describe, expect, it } from 'vitest';
import type { CardRecord, ReviewRecord } from '$lib/db/scheduler.js';
import {
	attemptTrend,
	deckState,
	retention,
	reviewsPerDay,
	streak,
	trendShift,
	type AttemptLike
} from './progress.js';

/**
 * The numbers this page is willing to state.
 *
 * Most of what is tested here is restraint rather than arithmetic: which figures are
 * withheld, which reviews are excluded from a rate, and where a day boundary falls. Those
 * are the parts that would be wrong silently — a retention figure computed over the wrong
 * subset still renders, and still looks authoritative.
 */

/** Local midnight `n` days before the fixed "now", as a timestamp. */
const NOW = new Date(2026, 8, 17, 14, 30).getTime(); // 17 Sep 2026, local afternoon
const daysAgo = (n: number, hour = 10) => {
	const d = new Date(NOW);
	d.setDate(d.getDate() - n);
	d.setHours(hour, 0, 0, 0);
	return d.getTime();
};

const review = (at: number, over: Partial<ReviewRecord> = {}): ReviewRecord => ({
	cardId: 'shaping',
	grade: 3,
	reviewedAt: at,
	scheduledDays: 1,
	state: 2,
	...over
});

const attempt = (n: number, correct: number, total = 10): AttemptLike => ({
	id: `a${n}`,
	credential: 'RBT',
	domain: 'all',
	finishedAt: daysAgo(30 - n),
	total,
	correct
});

describe('attemptTrend', () => {
	it('orders by when the sitting finished, not by the order they were stored', () => {
		const points = attemptTrend([attempt(3, 9), attempt(1, 4), attempt(2, 6)]);
		expect(points.map((p) => p.correct)).toEqual([4, 6, 9]);
		expect(points.map((p) => p.percent)).toEqual([40, 60, 90]);
	});

	/*
	 * A sitting with nothing answered would divide by zero and render as NaN%. Abandoned
	 * runs are a real thing — somebody opens the simulator and closes it.
	 */
	it('drops a sitting with no answers rather than dividing by zero', () => {
		expect(attemptTrend([{ ...attempt(1, 0), total: 0 }])).toEqual([]);
	});
});

describe('trendShift', () => {
	it('says nothing until there are enough sittings to mean it', () => {
		expect(trendShift(attemptTrend([attempt(1, 3), attempt(2, 9)]))).toBeNull();
		expect(trendShift(attemptTrend([attempt(1, 3)]))).toBeNull();
	});

	/*
	 * Halves rather than first-versus-last. These two runs have identical endpoints and
	 * opposite stories, and a first-to-last arrow would report them the same way.
	 */
	it('compares the recent half against the earlier half', () => {
		const rising = attemptTrend([
			attempt(1, 4),
			attempt(2, 4),
			attempt(3, 5),
			attempt(4, 8),
			attempt(5, 8),
			attempt(6, 9)
		]);
		expect(trendShift(rising)).toBeGreaterThan(0);

		const falling = attemptTrend([
			attempt(1, 9),
			attempt(2, 8),
			attempt(3, 8),
			attempt(4, 5),
			attempt(5, 4),
			attempt(6, 4)
		]);
		expect(trendShift(falling)).toBeLessThan(0);
	});
});

describe('reviewsPerDay', () => {
	it('returns one bucket per day including the empty ones', () => {
		const buckets = reviewsPerDay([review(daysAgo(0)), review(daysAgo(0))], NOW, 7);
		expect(buckets).toHaveLength(7);
		expect(buckets.at(-1)!.reviews).toBe(2);
		// The gap is the point: a deck that is not opened has to look like one.
		expect(buckets.slice(0, 6).every((b) => b.reviews === 0)).toBe(true);
	});

	it('buckets by local calendar day, not by a rolling 24 hours', () => {
		const lateLastNight = new Date(NOW);
		lateLastNight.setDate(lateLastNight.getDate() - 1);
		lateLastNight.setHours(23, 30, 0, 0);
		const buckets = reviewsPerDay([review(lateLastNight.getTime())], NOW, 2);
		expect(buckets[0]!.reviews).toBe(1);
		expect(buckets[1]!.reviews).toBe(0);
	});

	it('ignores anything older than the window', () => {
		expect(reviewsPerDay([review(daysAgo(60))], NOW, 30).every((b) => b.reviews === 0)).toBe(
			true
		);
	});
});

describe('retention', () => {
	/*
	 * The subset is the whole point. Grading a card "Again" three times while first
	 * learning it is the algorithm working, not a failure to remember, and folding those in
	 * would make a diligent new reader look like a failing one.
	 */
	it('counts only reviews taken in the review state', () => {
		const log = [
			...Array.from({ length: 20 }, () => review(daysAgo(1), { state: 2, grade: 3 })),
			...Array.from({ length: 20 }, () => review(daysAgo(1), { state: 1, grade: 1 })),
			...Array.from({ length: 20 }, () => review(daysAgo(1), { state: 0, grade: 1 }))
		];
		const r = retention(log);
		expect(r.tested).toBe(20);
		expect(r.percent).toBe(100);
	});

	it('treats Hard as remembered and Again as not', () => {
		const log = [
			...Array.from({ length: 15 }, () => review(daysAgo(1), { grade: 2 })),
			...Array.from({ length: 5 }, () => review(daysAgo(1), { grade: 1 }))
		];
		expect(retention(log)).toMatchObject({ tested: 20, kept: 15, percent: 75 });
	});

	it('withholds a rate below the minimum and says how many more are needed', () => {
		const r = retention([review(daysAgo(1)), review(daysAgo(1))]);
		expect(r.percent).toBeNull();
		expect(r.needed).toBe(18);
		// The raw counts are still there: the page shows the fraction whatever happens.
		expect(r).toMatchObject({ tested: 2, kept: 2 });
	});

	it('is empty-safe', () => {
		expect(retention([])).toMatchObject({ tested: 0, kept: 0, percent: null, needed: 20 });
	});
});

describe('streak', () => {
	it('counts consecutive days back from today', () => {
		const log = [review(daysAgo(0)), review(daysAgo(1)), review(daysAgo(2))];
		expect(streak(log, NOW).current).toBe(3);
	});

	/*
	 * Not studying yet *today* is not a broken streak. A counter that reset at midnight
	 * would tell somebody who opened the app before breakfast that they had lost a run
	 * they were about to continue.
	 */
	it('survives a today that has not been studied yet', () => {
		const log = [review(daysAgo(1)), review(daysAgo(2))];
		expect(streak(log, NOW).current).toBe(2);
	});

	it('is broken by a whole missed day', () => {
		const log = [review(daysAgo(2)), review(daysAgo(3))];
		expect(streak(log, NOW).current).toBe(0);
	});

	it('reports the longest run and the number of active days', () => {
		const log = [
			review(daysAgo(10)),
			review(daysAgo(9)),
			review(daysAgo(8)),
			review(daysAgo(8)),
			review(daysAgo(1))
		];
		const s = streak(log, NOW);
		expect(s.longest).toBe(3);
		// Two reviews on the same day is one active day.
		expect(s.activeDays).toBe(4);
	});

	it('is empty-safe', () => {
		expect(streak([], NOW)).toEqual({ current: 0, longest: 0, activeDays: 0 });
	});
});

describe('deckState', () => {
	const card = (state: number, id: string): CardRecord => ({
		id,
		due: 0,
		stability: 1,
		difficulty: 5,
		elapsedDays: 0,
		scheduledDays: 1,
		learningSteps: 0,
		reps: 1,
		lapses: 0,
		state,
		lastReview: null,
		createdAt: 0
	});

	it('reads relearning as learning, because that is what it is to a reader', () => {
		const s = deckState([card(0, 'a'), card(1, 'b'), card(2, 'c'), card(3, 'd')]);
		expect(s).toEqual({ fresh: 1, learning: 2, review: 1, total: 4 });
	});
});
