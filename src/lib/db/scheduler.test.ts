import { describe, expect, it } from 'vitest';
import {
	CARD_STATE,
	formatInterval,
	gradeCard,
	isDue,
	newCard,
	previewIntervals
} from './scheduler.js';

const T0 = Date.UTC(2026, 8, 14, 9, 0, 0);
const DAY = 86_400_000;

describe('flashcard scheduler', () => {
	it('a new card is due immediately and in the New state', () => {
		const c = newCard('extinction', T0);
		expect(c.id).toBe('extinction');
		expect(c.state).toBe(CARD_STATE.NEW);
		expect(isDue(c, T0)).toBe(true);
		expect(c.reps).toBe(0);
	});

	it('grading Good moves a new card forward and logs the review', () => {
		const { card, review } = gradeCard(newCard('extinction', T0), 3, T0);
		expect(card.due).toBeGreaterThan(T0);
		expect(card.reps).toBe(1);
		expect(card.lastReview).toBe(T0);
		expect(review).toMatchObject({ cardId: 'extinction', grade: 3, reviewedAt: T0 });
		expect(isDue(card, T0)).toBe(false);
	});

	it('Easy schedules further out than Good, which schedules further out than Again', () => {
		const base = newCard('mand', T0);
		const again = gradeCard(base, 1, T0).card.due;
		const good = gradeCard(base, 3, T0).card.due;
		const easy = gradeCard(base, 4, T0).card.due;
		expect(again).toBeLessThan(good);
		expect(good).toBeLessThan(easy);
	});

	it('a card in review that is graded Again lapses and comes back soon', () => {
		let c = newCard('tact', T0);
		c = gradeCard(c, 4, T0).card; // Easy: straight to review
		expect(c.state).toBe(CARD_STATE.REVIEW);
		const later = c.due + DAY;
		const lapsed = gradeCard(c, 1, later).card;
		expect(lapsed.lapses).toBe(1);
		expect(lapsed.state).toBe(CARD_STATE.RELEARNING);
		expect(lapsed.due - later).toBeLessThan(DAY);
	});

	it('intervals never exceed a year', () => {
		let c = newCard('shaping', T0);
		let now = T0;
		for (let i = 0; i < 30; i++) {
			c = gradeCard(c, 4, now).card;
			now = c.due;
		}
		expect(c.scheduledDays).toBeLessThanOrEqual(365);
	});

	it('previews an interval for every grade', () => {
		const p = previewIntervals(newCard('prompt', T0), T0);
		expect(Object.keys(p).sort()).toEqual(['1', '2', '3', '4']);
		for (const v of Object.values(p)) expect(v).toMatch(/^(<1m|\d+(m|h|d|mo|y))$/);
	});

	it('formats intervals for humans', () => {
		expect(formatInterval(20_000)).toBe('<1m');
		expect(formatInterval(10 * 60_000)).toBe('10m');
		expect(formatInterval(5 * 3_600_000)).toBe('5h');
		expect(formatInterval(3 * DAY)).toBe('3d');
		expect(formatInterval(45 * DAY)).toBe('2mo');
		expect(formatInterval(400 * DAY)).toBe('1y');
	});
});
