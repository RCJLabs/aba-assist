import { describe, expect, it } from 'vitest';
import {
	INTERVALS,
	LENGTHS,
	comparison,
	emptyRecord,
	intervalAgreement,
	intervalBounds,
	intervalCount,
	clip,
	clipRecord,
	makeStream,
	score,
	totalAgreement,
	trueMomentary,
	truePartial,
	trueSeconds,
	trueWhole,
	type Method,
	type Stream
} from './observe.js';

/** Every length and interval the page offers, over enough seeds to mean something. */
const everyCombination = (n = 40) =>
	LENGTHS.flatMap((seconds) =>
		INTERVALS.flatMap((intervalSeconds) =>
			Array.from({ length: n }, (_, i) =>
				makeStream(`seed-${seconds}-${intervalSeconds}-${i}`, { seconds, intervalSeconds })
			)
		)
	);

/** A stream written by hand, for the cases where a generated one would prove nothing. */
const fixed = (
	episodes: { start: number; end: number }[],
	seconds = 60,
	intervalSeconds = 10
) =>
	({ seed: 'fixed', behavior: 'hand raising', seconds, intervalSeconds, episodes }) as Stream;

const percentOf = (marks: boolean[]) => (marks.filter(Boolean).length / marks.length) * 100;
const durationPercent = (s: Stream) => (trueSeconds(s) / s.seconds) * 100;

describe('the generated stream', () => {
	it('is the same session every time the seed is', () => {
		// The whole reason a seed is carried on the record: run the same two minutes again
		// with a different method, and the comparison is between methods, not between
		// sessions.
		expect(makeStream('abc')).toEqual(makeStream('abc'));
		expect(makeStream('abc')).not.toEqual(makeStream('abd'));
	});

	it('keeps episodes inside the session and out of each other', () => {
		for (const s of everyCombination()) {
			let previousEnd = 0;
			for (const e of s.episodes) {
				expect(e.start).toBeGreaterThanOrEqual(previousEnd);
				expect(e.end).toBeGreaterThan(e.start);
				expect(e.end).toBeLessThanOrEqual(s.seconds);
				previousEnd = e.end;
			}
		}
	});

	it('always gives the reader something to record', () => {
		// A stream with no episodes is not a lesson about a quiet session, it is a bug that
		// scores 100% on every method.
		for (const s of everyCombination()) expect(s.episodes.length).toBeGreaterThan(0);
	});

	it('leaves some intervals genuinely empty', () => {
		/*
		 * Caught by looking at real output rather than by a test. Every gap was shorter than
		 * an interval, so every interval got touched and partial interval read 100% on every
		 * stream the generator could produce — which turns the exercise into marking every
		 * box, and teaches a confident falsehood about the method on the way past.
		 */
		const pinned = everyCombination().filter((s) => percentOf(truePartial(s)) === 100);
		expect(pinned.length / everyCombination().length).toBeLessThan(0.4);
	});

	it('produces episodes both shorter and longer than an interval', () => {
		/*
		 * The disagreement between the methods is the entire point, and it only appears when
		 * the episode lengths straddle the interval. All-short makes whole interval score
		 * zero every time; all-long makes the three sampling methods agree.
		 */
		const s = everyCombination();
		const lengths = s.flatMap((x) =>
			x.episodes.map((e) => (e.end - e.start) / x.intervalSeconds)
		);
		expect(lengths.some((l) => l < 1)).toBe(true);
		expect(lengths.some((l) => l > 1)).toBe(true);
	});
});

describe('what each method says about the same stream', () => {
	it('partial interval never reads lower than the behavior actually occurred', () => {
		/*
		 * Not a tendency — arithmetic. Partial interval scores a whole interval for any part
		 * of one, so each interval contributes at least the fraction of itself the behavior
		 * filled. This is the fact the exam states and the rehearsal exists to make visible.
		 */
		for (const s of everyCombination()) {
			expect(percentOf(truePartial(s))).toBeGreaterThanOrEqual(durationPercent(s) - 1e-9);
		}
	});

	it('whole interval never reads higher', () => {
		for (const s of everyCombination()) {
			expect(percentOf(trueWhole(s))).toBeLessThanOrEqual(durationPercent(s) + 1e-9);
		}
	});

	it('momentary time sampling errs in both directions, so it cannot be taught as a bias', () => {
		/*
		 * Worth pinning because the other two invite the wrong generalisation — that every
		 * sampling method leans a particular way. Momentary does not: it is a fair estimate
		 * that happens to miss whatever fell between the cues.
		 */
		const gaps = everyCombination().map(
			(s) => percentOf(trueMomentary(s)) - durationPercent(s)
		);
		expect(gaps.some((g) => g > 0)).toBe(true);
		expect(gaps.some((g) => g < 0)).toBe(true);
	});

	it('reports all four estimates of one stream', () => {
		const rows = comparison(makeStream('x'));
		expect(rows.map((r) => r.method)).toEqual([
			'duration',
			'partial-interval',
			'whole-interval',
			'momentary-time-sampling'
		]);
	});
});

describe('the truth for one interval', () => {
	const s = fixed([{ start: 12, end: 18 }]);

	it('scores a partial interval for an episode that only touches it', () => {
		expect(truePartial(s)).toEqual([false, true, false, false, false, false]);
	});

	it('scores no whole interval for an episode that does not fill one', () => {
		expect(trueWhole(s)).toEqual([false, false, false, false, false, false]);
	});

	it('will not let two episodes add up to a whole interval between them', () => {
		/*
		 * The behavior stopped in the middle, which is the one thing whole interval is for.
		 * Scoring this would make the method agree with partial interval on exactly the case
		 * that separates them.
		 */
		const split = fixed([
			{ start: 20, end: 25 },
			{ start: 25, end: 30 }
		]);
		expect(trueWhole(split)[2]).toBe(false);
		expect(trueWhole(fixed([{ start: 20, end: 30 }]))[2]).toBe(true);
	});

	it('samples at the moment the interval ends, not when it starts', () => {
		// Occurring for the first half of interval 2 and over by the cue at 30s.
		expect(trueMomentary(fixed([{ start: 20, end: 26 }]))[2]).toBe(false);
		expect(trueMomentary(fixed([{ start: 26, end: 34 }]))[2]).toBe(true);
	});

	it('counts the interval bounds half-open, so no second lands in two intervals', () => {
		expect(intervalBounds(s, 0)).toEqual([0, 10]);
		expect(intervalBounds(s, 5)).toEqual([50, 60]);
		expect(intervalCount(s)).toBe(6);
	});
});

describe('agreement', () => {
	it('is the smaller total over the larger', () => {
		expect(totalAgreement(8, 10)).toBe(80);
		expect(totalAgreement(10, 8)).toBe(80);
	});

	it('calls two observers who both saw nothing agreed, rather than NaN', () => {
		expect(totalAgreement(0, 0)).toBe(100);
	});

	it('compares intervals one at a time, not two percentages', () => {
		/*
		 * Both of these score six of twelve and agree on nothing. A method that compared the
		 * totals would call it perfect agreement, which is the worst kind of wrong number:
		 * confident, plausible, and exactly backwards.
		 */
		const a = [true, false, true, false, true, false, true, false, true, false, true, false];
		const b = a.map((x) => !x);
		expect(percentOf(a)).toBe(percentOf(b));
		expect(intervalAgreement(a, b)).toBe(0);
		expect(intervalAgreement(a, a)).toBe(100);
	});

	it('treats a missing mark as unscored rather than as a disagreement it cannot see', () => {
		expect(intervalAgreement([true], [true, false])).toBe(100);
		expect(intervalAgreement([true], [true, true])).toBe(50);
	});
});

describe('scoring a run', () => {
	const s = fixed([
		{ start: 5, end: 8 },
		{ start: 22, end: 35 },
		{ start: 48, end: 52 }
	]);

	it('gives a perfect frequency run full agreement', () => {
		const record = { ...emptyRecord('frequency'), taps: [5, 22, 48] };
		const out = score(s, record);
		expect(out.reported).toBe(3);
		expect(out.truth).toBe(3);
		expect(out.agreement).toBe(100);
	});

	it('scores a missed occurrence as the count it was', () => {
		const out = score(s, { ...emptyRecord('frequency'), taps: [5, 22] });
		expect(out.reported).toBe(2);
		expect(out.agreement).toBeCloseTo(66.67, 1);
	});

	it('rounds a hand-timed duration before comparing it', () => {
		/*
		 * The reader's spans come off a wall clock and carry milliseconds nobody recorded on
		 * purpose. Compared raw, a run that was right to the tenth of a second reports
		 * something like 99.97% and reads as a mistake.
		 */
		const out = score(s, {
			...emptyRecord('duration'),
			spans: [
				{ start: 5.02, end: 8.01 },
				{ start: 22.0, end: 34.99 },
				{ start: 48.01, end: 52.01 }
			]
		});
		expect(out.truth).toBe(20);
		expect(out.reported).toBe(20);
		expect(out.agreement).toBe(100);
	});

	it('pads a run that was left early rather than scoring the missing intervals as agreed', () => {
		const out = score(s, { ...emptyRecord('partial-interval'), marks: [false, true] });
		expect(out.marks).toHaveLength(intervalCount(s));
		expect(out.truthMarks).toHaveLength(intervalCount(s));
	});

	it('carries the comparison whichever method was used', () => {
		for (const m of [
			'frequency',
			'duration',
			'partial-interval',
			'whole-interval',
			'momentary-time-sampling'
		] as Method[]) {
			expect(score(s, emptyRecord(m)).comparison).toHaveLength(4);
		}
	});
});

describe('stopping early', () => {
	const s = fixed([
		{ start: 5, end: 8 },
		{ start: 22, end: 35 },
		{ start: 48, end: 52 }
	]);

	it('leaves a run that went the distance exactly as it was', () => {
		expect(clip(s, s.seconds)).toEqual(s);
	});

	it('cuts back to a whole interval, never a fragment of one', () => {
		// Whole interval and momentary sampling both report on a period that has to have
		// finished; a 37-second session with 10-second intervals has no fourth interval.
		expect(clip(s, 37).seconds).toBe(30);
		expect(intervalCount(clip(s, 37))).toBe(3);
	});

	it('cuts an episode that was still running at the moment they stopped', () => {
		expect(clip(s, 30).episodes).toEqual([
			{ start: 5, end: 8 },
			{ start: 22, end: 30 }
		]);
	});

	it('never cuts below one interval, so there is always something to score', () => {
		expect(clip(s, 0).seconds).toBe(s.intervalSeconds);
	});

	it('scores a short run against the short session rather than the whole one', () => {
		/*
		 * The point of clipping. Two of the three occurrences happen in the first thirty
		 * seconds; a reader who caught both and stopped there was right about what they saw,
		 * and scoring them 2-of-3 would be the app inventing an error.
		 */
		const clipped = clip(s, 30);
		const out = score(
			clipped,
			clipRecord({ ...emptyRecord('frequency'), taps: [5, 22] }, clipped)
		);
		expect(out.truth).toBe(2);
		expect(out.agreement).toBe(100);
	});

	it('drops what the reader recorded after they stopped', () => {
		const clipped = clip(s, 30);
		const cut = clipRecord(
			{ ...emptyRecord('frequency'), taps: [5, 22, 48], marks: [true, true, true, true] },
			clipped
		);
		expect(cut.taps).toEqual([5, 22]);
		expect(cut.marks).toHaveLength(3);
	});
});
