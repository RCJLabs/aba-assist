import { describe, expect, it } from 'vitest';
import {
	DUE_SOON_DAYS,
	VOLATILE_KINDS,
	daysUntil,
	describeDue,
	isVolatileKind,
	reviewSchedule,
	stalenessOf,
	type DatedItem
} from './staleness.js';

const NOW = Date.parse('2026-09-18T11:00:00Z');
const DAY = 86_400_000;
/** A date `n` days from NOW, as the content files write it. */
const on = (n: number) => new Date(NOW + n * DAY).toISOString().slice(0, 10);

const item = (id: string, due: string | null, kind = 'credential'): DatedItem => ({
	id,
	kind,
	label: id,
	against: null,
	nextReviewDue: due
});

describe('which content can go stale', () => {
	it('covers the kinds restated from a maintained document', () => {
		for (const k of ['credential', 'outline', 'ethics-code', 'competency']) {
			expect(isVolatileKind(k)).toBe(true);
		}
	});

	it('leaves alone the kinds written from literature that will not be reissued', () => {
		/*
		 * A definition written from Michael 1982 does not rot. Requiring a re-check date on
		 * 259 terms would bury the handful of files that genuinely need one, which is the
		 * failure mode of every checklist nobody reads.
		 */
		for (const k of [
			'term',
			'scenario',
			'question',
			'graph',
			'practice-guide',
			'ethics-topic'
		]) {
			expect(isVolatileKind(k)).toBe(false);
		}
	});

	it('is a closed list, so a new kind is a deliberate decision', () => {
		expect([...VOLATILE_KINDS].sort()).toEqual([
			'competency',
			'credential',
			'ethics-code',
			'outline'
		]);
	});
});

describe('where a date stands', () => {
	it('is fresh well before the horizon', () => {
		expect(stalenessOf(on(DUE_SOON_DAYS + 1), NOW)).toBe('fresh');
	});

	it('is due soon inside the horizon', () => {
		expect(stalenessOf(on(DUE_SOON_DAYS), NOW)).toBe('due-soon');
		expect(stalenessOf(on(1), NOW)).toBe('due-soon');
	});

	it('is still due soon, not overdue, on the day itself', () => {
		// The date is when it falls due, not the day after it expired.
		expect(stalenessOf(on(0), NOW)).toBe('due-soon');
	});

	it('is overdue once the day has passed', () => {
		expect(stalenessOf(on(-1), NOW)).toBe('overdue');
	});

	it('reports a missing date as its own state rather than as fresh', () => {
		/*
		 * The distinction the build rests on. A missing date means nobody decided how long
		 * this fact was good for, which is a different failure from one that has expired —
		 * and reading it as fresh is how a staleness mechanism quietly does nothing.
		 */
		expect(stalenessOf(null, NOW)).toBe('unset');
	});

	it('reports an unparseable date as unset rather than as a wild number', () => {
		expect(stalenessOf('not-a-date', NOW)).toBe('unset');
		expect(Number.isNaN(daysUntil('not-a-date', NOW))).toBe(true);
	});
});

describe('the schedule', () => {
	it('puts the soonest expiry first', () => {
		const out = reviewSchedule(
			[item('late', on(90)), item('soon', on(5)), item('middle', on(40))],
			NOW
		);
		expect(out.rows.map((r) => r.id)).toEqual(['soon', 'middle', 'late']);
	});

	it('puts overdue items ahead of everything, most overdue first', () => {
		const out = reviewSchedule(
			[item('ok', on(10)), item('a', on(-2)), item('b', on(-30))],
			NOW
		);
		expect(out.rows.map((r) => r.id)).toEqual(['b', 'a', 'ok']);
	});

	it('sorts undated items last, because they are a different problem', () => {
		const out = reviewSchedule([item('undated', null), item('dated', on(3))], NOW);
		expect(out.rows.map((r) => r.id)).toEqual(['dated', 'undated']);
	});

	it('breaks a tie on the id so the order is the same on every build', () => {
		const out = reviewSchedule([item('b', on(7)), item('a', on(7))], NOW);
		expect(out.rows.map((r) => r.id)).toEqual(['a', 'b']);
	});

	it('separates the three ways a date can need attention', () => {
		const out = reviewSchedule(
			[item('gone', on(-1)), item('soon', on(3)), item('none', null), item('fine', on(300))],
			NOW
		);
		expect(out.overdue.map((r) => r.id)).toEqual(['gone']);
		expect(out.dueSoon.map((r) => r.id)).toEqual(['soon']);
		expect(out.unset.map((r) => r.id)).toEqual(['none']);
	});

	it('reports the next date still ahead, skipping the ones already passed', () => {
		const out = reviewSchedule([item('gone', on(-5)), item('next', on(12))], NOW);
		expect(out.nextDue).toBe(on(12));
	});

	it('reports no next date when everything has passed or is undated', () => {
		expect(reviewSchedule([item('gone', on(-5)), item('none', null)], NOW).nextDue).toBeNull();
	});

	it('reports nothing at all for an empty corpus rather than throwing', () => {
		expect(reviewSchedule([], NOW)).toEqual({
			rows: [],
			overdue: [],
			dueSoon: [],
			unset: [],
			nextDue: null
		});
	});
});

describe('saying it in words', () => {
	it('says how far overdue, and what the date was', () => {
		const out = reviewSchedule([item('RBT Handbook', on(-3))], NOW);
		expect(describeDue(out.rows[0]!)).toContain('3 days overdue');
		expect(describeDue(out.rows[0]!)).toContain(on(-3));
	});

	it('says how long is left when it has not passed', () => {
		const out = reviewSchedule([item('RBT Handbook', on(14))], NOW);
		expect(describeDue(out.rows[0]!)).toContain('due in 14 days');
	});

	it('does not write "1 days"', () => {
		const out = reviewSchedule([item('x', on(1))], NOW);
		expect(describeDue(out.rows[0]!)).toContain('1 day');
		expect(describeDue(out.rows[0]!)).not.toContain('1 days');
	});

	it('says plainly when no date was set', () => {
		const out = reviewSchedule([item('x', null)], NOW);
		expect(describeDue(out.rows[0]!)).toContain('no re-check date set');
	});
});
