import { describe, expect, it } from 'vitest';
import { outstanding, planRetry, type AttemptLike } from './retry.js';

const DAY = 86_400_000;
const T0 = Date.parse('2026-03-01T10:00:00Z');

const run = (
	daysIn: number,
	missed: string[],
	right: string[] = [],
	credential = 'RBT'
): AttemptLike => ({
	credential,
	finishedAt: T0 + daysIn * DAY,
	missed,
	right
});

/** A run recorded before the app kept track of what it got right. */
const legacyRun = (daysIn: number, missed: string[]): AttemptLike => ({
	credential: 'RBT',
	finishedAt: T0 + daysIn * DAY,
	missed
});

describe('what is still outstanding', () => {
	it('returns nothing before anything has been sat', () => {
		expect(outstanding([], 'RBT')).toEqual([]);
	});

	it('keeps a question that was missed and never revisited', () => {
		const out = outstanding([run(0, ['q1'], ['q2'])], 'RBT');
		expect(out.map((q) => q.id)).toEqual(['q1']);
	});

	it('clears a question answered correctly after it was missed', () => {
		/*
		 * The whole point of recording what a run got right. Without this the queue only
		 * ever grows, and a queue that never shrinks is one nobody opens twice.
		 */
		const out = outstanding([run(0, ['q1']), run(7, [], ['q1'])], 'RBT');
		expect(out).toEqual([]);
	});

	it('reopens a question missed again after it was cleared', () => {
		const out = outstanding([run(0, ['q1']), run(7, [], ['q1']), run(14, ['q1'])], 'RBT');
		expect(out.map((q) => q.id)).toEqual(['q1']);
		// Two misses, not one: getting it right in between does not unsay either of them.
		expect(out[0]!.misses).toBe(2);
	});

	it('reads the sittings in time order however they arrive', () => {
		// The caller hands these over newest-first, so a walk that trusted array order
		// would clear a question with a correct answer that came *before* the miss.
		const newestFirst = [run(7, ['q1']), run(0, [], ['q1'])];
		expect(outstanding(newestFirst, 'RBT').map((q) => q.id)).toEqual(['q1']);
	});

	it('ignores a correct answer to a question never missed', () => {
		expect(outstanding([run(0, [], ['q9'])], 'RBT')).toEqual([]);
	});

	it('lets an old run put a question in the queue but never take one out', () => {
		/*
		 * Runs recorded before `right` existed have no answer to "what did this get
		 * right", and inventing one either way would be a lie. Contributing misses only is
		 * the honest reading, and it fails safe: the question comes back rather than
		 * silently disappearing.
		 */
		const legacy = legacyRun(0, ['q1']);
		expect(legacy.right).toBeUndefined();
		expect(outstanding([legacy], 'RBT').map((q) => q.id)).toEqual(['q1']);
		expect(outstanding([legacy, run(3, [], ['q1'])], 'RBT')).toEqual([]);
	});

	it('leaves another exam’s questions alone', () => {
		const out = outstanding([run(0, ['rbt-1']), run(1, ['bcba-1'], [], 'BCBA')], 'RBT');
		expect(out.map((q) => q.id)).toEqual(['rbt-1']);
	});
});

describe('the order they come back in', () => {
	it('puts the question that keeps catching you out first', () => {
		const out = outstanding([run(0, ['a', 'b']), run(1, ['b']), run(2, ['b', 'c'])], 'RBT');
		expect(out.map((q) => q.id)).toEqual(['b', 'a', 'c']);
	});

	it('breaks a tie on how long it has been outstanding', () => {
		const out = outstanding([run(0, ['old']), run(5, ['new'])], 'RBT');
		expect(out.map((q) => q.id)).toEqual(['old', 'new']);
	});

	it('orders the same way whatever order the sittings arrive in', () => {
		const runs = [run(0, ['a', 'b']), run(1, ['b']), run(2, ['c'])];
		const a = outstanding(runs, 'RBT').map((q) => q.id);
		const b = outstanding([...runs].reverse(), 'RBT').map((q) => q.id);
		expect(a).toEqual(b);
	});

	it('breaks a dead tie on the id rather than on sort stability', () => {
		const out = outstanding([run(0, ['z', 'y', 'x'])], 'RBT');
		expect(out.map((q) => q.id)).toEqual(['x', 'y', 'z']);
	});

	it('counts every miss and remembers both ends of the wait', () => {
		const out = outstanding([run(0, ['q']), run(4, ['q'])], 'RBT');
		expect(out[0]).toEqual({
			id: 'q',
			misses: 2,
			firstMissedAt: T0,
			lastMissedAt: T0 + 4 * DAY
		});
	});
});

describe('the queue against a build', () => {
	const bank = new Set(['a', 'b', 'c']);

	it('drops a question this build no longer has, and counts it', () => {
		/*
		 * Questions are rebuilt from source every build and the release channel withholds
		 * what has not been reviewed, so a recorded id can simply stop existing. Counting
		 * it is what lets the page explain a number that would otherwise look wrong.
		 */
		const out = planRetry([run(0, ['a', 'withdrawn'])], 'RBT', bank);
		expect(out.ids).toEqual(['a']);
		expect(out.total).toBe(2);
		expect(out.gone).toBe(1);
	});

	it('reports nothing gone when the build still has everything', () => {
		const out = planRetry([run(0, ['a', 'b'])], 'RBT', bank);
		expect(out).toEqual({ ids: ['a', 'b'], total: 2, gone: 0 });
	});

	it('is empty and says nothing is gone when nothing was ever missed', () => {
		expect(planRetry([run(0, [], ['a'])], 'RBT', bank)).toEqual({
			ids: [],
			total: 0,
			gone: 0
		});
	});

	it('never repeats a question to pad the queue', () => {
		// A short queue is a short queue. Repeating one to reach a round number is the
		// habit that earned the incumbent apps their reviews.
		const out = planRetry([run(0, ['a']), run(1, ['a']), run(2, ['a'])], 'RBT', bank);
		expect(out.ids).toEqual(['a']);
	});
});
