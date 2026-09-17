import { describe, expect, it } from 'vitest';
import type { Supervisee, SupervisionQuestion } from '$lib/db/index.js';
import {
	TOPICS,
	TOPIC_LABELS,
	WAITING_TOO_LONG_DAYS,
	agenda,
	daysWaiting,
	openQuestions,
	summarise
} from './agenda.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-17T12:00:00Z');

const q = (
	id: string,
	daysAgo: number,
	superviseeId: string | null = null,
	answeredAt: number | null = null
): SupervisionQuestion => ({
	id,
	superviseeId,
	topic: 'the-plan',
	question: `Question ${id}`,
	raisedAt: NOW - daysAgo * DAY,
	answeredAt
});

const person = (id: string, code: string): Supervisee => ({
	id,
	code,
	role: 'RBT',
	active: true,
	createdAt: NOW
});

describe('the open list', () => {
	it('puts the oldest question first', () => {
		/*
		 * The whole ordering decision. A question parked three weeks ago is not stale — it is
		 * the one that has been bumped off the end of three meetings running, and putting it
		 * under this week's fresher one is how it gets bumped off a fourth.
		 */
		const out = openQuestions([q('new', 1), q('old', 21), q('middle', 7)]);
		expect(out.map((x) => x.id)).toEqual(['old', 'middle', 'new']);
	});

	it('leaves out anything already taken to a meeting', () => {
		const out = openQuestions([q('done', 5, null, NOW), q('open', 2)]);
		expect(out.map((x) => x.id)).toEqual(['open']);
	});

	it('breaks a tie the same way every time', () => {
		// Two parked in the same second must not depend on sort stability, or the agenda a
		// reader printed stops matching the one still on screen.
		const same = [q('b', 3), q('a', 3), q('c', 3)];
		expect(openQuestions(same).map((x) => x.id)).toEqual(['a', 'b', 'c']);
		expect(openQuestions([...same].reverse()).map((x) => x.id)).toEqual(['a', 'b', 'c']);
	});
});

describe('the agenda', () => {
	const people = [person('s1', 'S-04'), person('s2', 'BT12')];

	it('groups by supervisee, in code order', () => {
		const out = agenda([q('a', 2, 's1'), q('b', 3, 's2')], people);
		expect(out.map((g) => g.code)).toEqual(['BT12', 'S-04']);
	});

	it('puts the author’s own questions last', () => {
		/*
		 * They are the ones that can be asked in a corridor. The ones about somebody else are
		 * why the meeting has a time slot at all.
		 */
		const out = agenda([q('mine', 9), q('theirs', 1, 's1')], people);
		expect(out.map((g) => g.code)).toEqual(['S-04', null]);
	});

	it('keeps the oldest-first order inside a group', () => {
		const out = agenda([q('new', 1, 's1'), q('old', 30, 's1')], people);
		expect(out[0].questions.map((x) => x.id)).toEqual(['old', 'new']);
	});

	it('keeps a question whose supervisee is gone rather than dropping it', () => {
		/*
		 * The delete cascades, so this should not arise from use — but a restored backup is
		 * somebody else's file, and losing a written question because a reference did not
		 * resolve is the one outcome worth ruling out.
		 */
		const out = agenda([q('orphan', 4, 'deleted-id')], people);
		expect(out).toHaveLength(1);
		expect(out[0].code).toBeNull();
		expect(out[0].questions.map((x) => x.id)).toEqual(['orphan']);
	});

	it('leaves answered questions off it entirely', () => {
		expect(agenda([q('done', 2, 's1', NOW)], people)).toEqual([]);
	});
});

describe('the summary', () => {
	it('counts what is open and how long the oldest has waited', () => {
		const out = summarise([q('a', 3), q('b', 20), q('c', 1, null, NOW)], NOW);
		expect(out.open).toBe(2);
		expect(out.oldestDays).toBe(20);
		expect(out.answeredEver).toBe(1);
	});

	it('flags only what has waited past a fortnight', () => {
		const out = summarise(
			[q('just-under', WAITING_TOO_LONG_DAYS - 1), q('over', WAITING_TOO_LONG_DAYS)],
			NOW
		);
		expect(out.overdue).toBe(1);
	});

	it('reports zeroes rather than negative infinity with nothing open', () => {
		// Math.max of an empty list is -Infinity, which renders as "-Infinity days waiting".
		const out = summarise([], NOW);
		expect(out).toEqual({ open: 0, oldestDays: 0, overdue: 0, answeredEver: 0 });
	});

	it('never reports a negative wait for a clock that moved backwards', () => {
		expect(daysWaiting(q('future', -2), NOW)).toBe(0);
	});
});

describe('the topics', () => {
	it('has a label for every one, so nothing renders as its own id', () => {
		for (const t of TOPICS) {
			expect(TOPIC_LABELS[t]).toBeTruthy();
			expect(TOPIC_LABELS[t]).not.toContain('-');
		}
	});
});
