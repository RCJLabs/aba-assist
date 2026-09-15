import { describe, expect, it } from 'vitest';
import { clock, METHODS, methodInfo, plan, positionAt, tally } from './interval.js';

describe('plan', () => {
	it('fits whole intervals into the observation', () => {
		expect(plan(10, 5)).toEqual({ intervalSeconds: 10, totalSeconds: 300, intervals: 30 });
		expect(plan(15, 2)).toEqual({ intervalSeconds: 15, totalSeconds: 120, intervals: 8 });
	});

	it('drops a trailing part-interval rather than scoring it', () => {
		// A part-interval is not an interval, and counting it would quietly change the
		// denominator of the percentage somebody reports.
		expect(plan(60, 2.5).intervals).toBe(2);
		expect(plan(45, 1).intervals).toBe(1);
	});

	it('never plans a run shorter than one interval', () => {
		const p = plan(60, 0.1);
		expect(p.intervals).toBe(1);
		expect(p.totalSeconds).toBe(60);
	});
});

describe('positionAt', () => {
	const p = plan(10, 1); // six ten-second intervals

	it('reports the interval and the time to the next cue', () => {
		expect(positionAt(0, p)).toEqual({ index: 0, remainingMs: 10_000, finished: false });
		expect(positionAt(3_000, p)).toEqual({ index: 0, remainingMs: 7_000, finished: false });
		expect(positionAt(10_000, p)).toEqual({ index: 1, remainingMs: 10_000, finished: false });
		expect(positionAt(25_500, p).index).toBe(2);
	});

	it('is derived from elapsed time, so a locked phone catches up rather than drifting', () => {
		// The property that makes this usable in a session: come back after two minutes
		// and the run is where the clock says, not where the last tick left it.
		expect(positionAt(45_000, p).index).toBe(4);
		expect(positionAt(59_999, p)).toMatchObject({ index: 5, finished: false });
	});

	it('finishes at the end rather than running past it', () => {
		expect(positionAt(60_000, p)).toEqual({ index: 5, remainingMs: 0, finished: true });
		expect(positionAt(600_000, p)).toEqual({ index: 5, remainingMs: 0, finished: true });
	});

	it('treats a negative elapsed time as the start', () => {
		expect(positionAt(-5_000, p).index).toBe(0);
	});
});

describe('tally', () => {
	it('is a percentage of scored intervals, not of all of them', () => {
		// An unscored interval is missing data. Counting it as a no understates the
		// behaviour, and the mistake would look like an improvement.
		expect(tally([true, false, null, null])).toEqual({ scored: 2, occurred: 1, percent: 50 });
		expect(tally([true, true, true])).toEqual({ scored: 3, occurred: 3, percent: 100 });
	});

	it('reports null rather than zero before anything is scored', () => {
		expect(tally([null, null]).percent).toBeNull();
		expect(tally([]).percent).toBeNull();
	});

	it('rounds to a whole percent', () => {
		expect(tally([true, false, false]).percent).toBe(33);
		expect(tally([true, true, false]).percent).toBe(67);
	});
});

describe('METHODS', () => {
	it('names the direction each procedure is wrong in', () => {
		// The reason this is not a generic timer: a technician who does not know which way
		// the number is biased hands their supervisor something that means the wrong thing.
		expect(methodInfo('partial').bias).toMatch(/[Oo]verestimates/);
		expect(methodInfo('whole').bias).toMatch(/[Uu]nderestimates/);
		expect(methodInfo('momentary').bias).toMatch(/[Cc]losest/);
	});

	it('links each one to the glossary entry that defines it', () => {
		for (const m of METHODS) expect(m.termId).toMatch(/^[a-z-]+$/);
	});
});

describe('clock', () => {
	it('counts remaining whole seconds, rounded up', () => {
		expect(clock(0)).toBe('0:00');
		expect(clock(1)).toBe('0:01');
		expect(clock(9_400)).toBe('0:10');
		expect(clock(65_000)).toBe('1:05');
		expect(clock(-100)).toBe('0:00');
	});
});

describe('the cue schedule', () => {
	it('lands on the right interval after a gap in ticks', () => {
		// The property that makes this usable: browsers throttle a hidden tab's timers to
		// about once a minute and phones lock outright. A counter would drift; elapsed
		// time cannot.
		const p = plan(10, 10);
		const ticks = [0, 200, 400, 90_000, 90_200];
		const indexes = ticks.map((t) => positionAt(t, p).index);
		expect(indexes).toEqual([0, 0, 0, 9, 9]);
	});

	it('does not run past the end when the page comes back late', () => {
		const p = plan(30, 2); // four intervals
		expect(positionAt(10 * 60_000, p)).toEqual({ index: 3, remainingMs: 0, finished: true });
	});
});
