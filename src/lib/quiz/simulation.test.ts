import { describe, expect, it } from 'vitest';
import {
	crossedWarning,
	examFormat,
	formatClock,
	planSimulation,
	secondsLeft,
	type ExamFormat
} from './simulation.js';

// The two real papers, as the outlines record them.
const RBT: ExamFormat = { totalItems: 85, scoredItems: 75, minutes: 90 };
const BCBA: ExamFormat = { totalItems: 185, scoredItems: 175, minutes: 240 };

describe('examFormat', () => {
	it('adds unscored items into the total, because they cost the same time', () => {
		const f = examFormat({ exam: { scoredItems: 75, unscoredItems: 10, minutes: 90 } });
		expect(f).toEqual({ totalItems: 85, scoredItems: 75, minutes: 90 });
	});

	it('returns null rather than guessing when the format is not modelled', () => {
		expect(
			examFormat({ exam: { scoredItems: null, unscoredItems: 10, minutes: 90 } })
		).toBeNull();
		expect(
			examFormat({ exam: { scoredItems: 75, unscoredItems: 10, minutes: null } })
		).toBeNull();
	});
});

describe('planSimulation', () => {
	it('runs a full-length paper once the bank can fill one', () => {
		const p = planSimulation(RBT, 200)!;
		expect(p.questions).toBe(85);
		expect(p.minutes).toBe(90);
		expect(p.isFullLength).toBe(true);
		expect(p.shortfall).toBe(0);
	});

	it('keeps the real pace when the bank is short, and says how short', () => {
		// 90 minutes over 85 items is ~63.5 seconds each; 65 of them is ~69 minutes.
		const p = planSimulation(RBT, 65)!;
		expect(p.questions).toBe(65);
		expect(p.secondsPerQuestion).toBe(63.5);
		expect(p.minutes).toBe(69);
		expect(p.shortfall).toBe(20);
		expect(p.isFullLength).toBe(false);
	});

	it('never pads a short bank by repeating questions', () => {
		// The count is capped by the bank, never by the paper.
		expect(planSimulation(BCBA, 45)!.questions).toBe(45);
		expect(planSimulation(BCBA, 45)!.shortfall).toBe(140);
	});

	it('rounds the allowance up, so a simulation is never meaner than the real exam', () => {
		const p = planSimulation(BCBA, 10)!;
		// 240 minutes over 185 items is ~77.8 seconds; ten of them is 12.97 minutes.
		expect(p.minutes).toBe(13);
	});

	it('returns null for an empty bank rather than a zero-question exam', () => {
		expect(planSimulation(RBT, 0)).toBeNull();
	});
});

describe('secondsLeft', () => {
	it('counts down from the clock, so a backgrounded tab cannot pause it', () => {
		const deadline = 1_000_000;
		expect(secondsLeft(deadline, deadline - 90_000)).toBe(90);
		expect(secondsLeft(deadline, deadline)).toBe(0);
		// Past the deadline is zero, not a negative countdown.
		expect(secondsLeft(deadline, deadline + 60_000)).toBe(0);
	});
});

describe('formatClock', () => {
	it('drops the hour until there is one', () => {
		expect(formatClock(0)).toBe('00:00');
		expect(formatClock(59)).toBe('00:59');
		expect(formatClock(90)).toBe('01:30');
		expect(formatClock(3600)).toBe('1:00:00');
		expect(formatClock(14_400)).toBe('4:00:00');
	});

	it('never shows a negative clock', () => {
		expect(formatClock(-5)).toBe('00:00');
	});
});

describe('crossedWarning', () => {
	it('fires once, on the tick that crosses a threshold', () => {
		expect(crossedWarning(601, 600)).toBe(600);
		expect(crossedWarning(600, 599)).toBeNull();
		expect(crossedWarning(61, 59)).toBe(60);
	});

	it('reports the most urgent threshold when several are jumped at once', () => {
		// A backgrounded tab returns with minutes gone. Announcing the largest crossed
		// threshold would tell somebody with 30 seconds left that they have half an hour.
		expect(crossedWarning(1900, 30)).toBe(60);
		expect(crossedWarning(1900, 400)).toBe(600);
	});

	it('says nothing between thresholds', () => {
		expect(crossedWarning(1200, 1100)).toBeNull();
	});
});
