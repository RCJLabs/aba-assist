import { describe, expect, it } from 'vitest';
import {
	SITTING_EXPIRY_MS,
	SITTING_SIZES,
	countsAsRead,
	estimateMinutes,
	isFinished,
	minutesElapsed,
	restore,
	serialise,
	tally,
	type SittingDecision
} from './sitting.js';

const T0 = Date.parse('2026-09-18T09:00:00Z');
const MIN = 60_000;

const read = (
	atMinutes: number,
	decision: 'approved' | 'needs-change' = 'approved'
): SittingDecision => ({ decision, decidedAt: T0 + atMinutes * MIN });

const carried = (atMinutes: number): SittingDecision => ({
	decision: 'approved',
	decidedAt: T0 + atMinutes * MIN,
	method: 'sampled'
});

describe('what counts towards a sitting', () => {
	it('counts a decision made after it began', () => {
		expect(countsAsRead(read(5), T0)).toBe(true);
	});

	it('ignores a decision made before it began', () => {
		// Otherwise last week's work would finish today's sitting on arrival.
		expect(countsAsRead(read(-5), T0)).toBe(false);
	});

	it('never counts a carried term', () => {
		/*
		 * The load-bearing exclusion. Carrying a batch is what a reviewer does instead of
		 * reading it, so counting thirty carried terms as thirty reviewed would finish a
		 * sitting of ten without anybody having read anything.
		 */
		expect(countsAsRead(carried(5), T0)).toBe(false);
	});

	it('counts nothing at all when no sitting is running', () => {
		expect(countsAsRead(read(5), 0)).toBe(false);
	});
});

describe('the tally', () => {
	it('splits what was decided into approved and flagged', () => {
		const out = tally([read(1), read(2, 'needs-change'), read(3)], T0);
		expect(out).toEqual({ done: 3, approved: 2, flagged: 1 });
	});

	it('leaves carried terms and earlier work out of every figure', () => {
		const out = tally([read(-60), carried(1), carried(2), read(3)], T0);
		expect(out).toEqual({ done: 1, approved: 1, flagged: 0 });
	});

	it('reports zeroes rather than nothing on an empty history', () => {
		expect(tally([], T0)).toEqual({ done: 0, approved: 0, flagged: 0 });
	});
});

describe('finishing', () => {
	it('is not finished below the target', () => {
		expect(isFinished({ target: 10, startedAt: T0 }, 9)).toBe(false);
	});

	it('is finished at the target', () => {
		expect(isFinished({ target: 10, startedAt: T0 }, 10)).toBe(true);
	});

	it('stays finished past the target', () => {
		// Carrying on after the finish line is allowed, and must not un-finish it.
		expect(isFinished({ target: 10, startedAt: T0 }, 14)).toBe(true);
	});

	it('is never finished when there is no sitting', () => {
		expect(isFinished(null, 99)).toBe(false);
	});
});

describe('elapsed time', () => {
	it('reports whole minutes since it began', () => {
		expect(minutesElapsed({ target: 5, startedAt: T0 }, T0 + 14 * MIN + 30_000)).toBe(14);
	});

	it('reports zero rather than a negative for a clock that moved backwards', () => {
		expect(minutesElapsed({ target: 5, startedAt: T0 }, T0 - MIN)).toBe(0);
	});

	it('reports zero with no sitting', () => {
		expect(minutesElapsed(null, T0)).toBe(0);
	});
});

describe('what a sitting would cost', () => {
	it('adds up the tiers of the items actually about to be offered', () => {
		// A is three minutes, B one and a half, C three quarters.
		expect(estimateMinutes(['A', 'A', 'A'])).toBe(9);
		expect(estimateMinutes(['C', 'C', 'C', 'C'])).toBe(3);
	});

	it('does not average across tiers that differ by four times', () => {
		/*
		 * Ten tier-A items is half an hour and ten tier-C items is eight minutes. A single
		 * per-item average would quote the same number for both, and the figure exists
		 * precisely to answer "have I got time for this right now".
		 */
		expect(estimateMinutes(Array(10).fill('A'))).toBe(30);
		expect(estimateMinutes(Array(10).fill('C'))).toBe(8);
	});

	it('is zero for an empty queue', () => {
		expect(estimateMinutes([])).toBe(0);
	});
});

describe('surviving a reload', () => {
	it('comes back from what it stored', () => {
		const sitting = { target: 10, startedAt: T0 };
		expect(restore(serialise(sitting), T0 + 5 * MIN)).toEqual(sitting);
	});

	it('is over once it is older than an afternoon', () => {
		const sitting = { target: 10, startedAt: T0 };
		const raw = serialise(sitting);
		expect(restore(raw, T0 + SITTING_EXPIRY_MS - 1)).toEqual(sitting);
		expect(restore(raw, T0 + SITTING_EXPIRY_MS + 1)).toBeNull();
	});

	it('refuses a sitting that claims to start in the future', () => {
		// A clock that moved backwards would otherwise leave a sitting with a negative age,
		// which can never expire and would sit there forever.
		expect(restore(serialise({ target: 5, startedAt: T0 + MIN }), T0)).toBeNull();
	});

	it('refuses anything it did not write', () => {
		// The value is whatever is under that key, which is not necessarily ours.
		for (const junk of [null, '', 'not json', '42', '"a string"', '[]', '{}']) {
			expect(restore(junk, T0)).toBeNull();
		}
	});

	it('refuses a malformed target or start', () => {
		for (const bad of [
			{ target: 0, startedAt: T0 },
			{ target: -5, startedAt: T0 },
			{ target: 10, startedAt: 0 },
			{ target: Number.NaN, startedAt: T0 },
			{ target: '10', startedAt: T0 }
		]) {
			expect(restore(JSON.stringify(bad), T0 + MIN)).toBeNull();
		}
	});
});

describe('the sizes offered', () => {
	it('are small enough to finish', () => {
		// The whole point. A sitting of 50 is the two-hour job wearing a different hat.
		expect(Math.max(...SITTING_SIZES)).toBeLessThanOrEqual(20);
		expect(SITTING_SIZES.every((n) => n > 0)).toBe(true);
	});
});
