import { describe, expect, it } from 'vitest';
import { BADGE_MAX, badgeValue, dueCount, REFRESH_INTERVAL_MS } from './badge.js';

const T = Date.parse('2026-09-20T09:00:00Z');
const HOUR = 3_600_000;

describe('counting what is due', () => {
	it('counts a card due exactly now', () => {
		// FSRS writes a due timestamp and the queue treats `due <= now` as due. The
		// boundary has to agree with the queue or the badge promises a card the session
		// does not offer.
		expect(dueCount([T], T)).toBe(1);
	});

	it('leaves out what is not due yet', () => {
		expect(dueCount([T - HOUR, T + HOUR, T + 48 * HOUR], T)).toBe(1);
	});

	it('counts nothing as nothing', () => {
		expect(dueCount([], T)).toBe(0);
	});
});

describe('what reaches the icon', () => {
	it('clears rather than showing a zero', () => {
		/*
		 * `setAppBadge(0)` clears on some platforms and draws a bare dot on others, and a
		 * dot meaning "nothing is due" draws the eye and then wastes the trip. Null is the
		 * instruction to clear.
		 */
		expect(badgeValue(0)).toBeNull();
	});

	it('treats a negative count as nothing rather than passing it on', () => {
		// Nothing should produce one, which is exactly why it is worth not trusting: the
		// API throws on a negative and the failure would be silent and total.
		expect(badgeValue(-3)).toBeNull();
	});

	it('shows a real count as itself', () => {
		expect(badgeValue(12)).toBe(12);
	});

	it('stops at the point the platforms stop counting anyway', () => {
		expect(badgeValue(BADGE_MAX)).toBe(BADGE_MAX);
		expect(badgeValue(5000)).toBe(BADGE_MAX);
	});
});

describe('the background refresh', () => {
	it('asks for an interval a browser will plausibly honour', () => {
		/*
		 * Chrome treats `minInterval` as a floor and a hint, deciding the real cadence
		 * from how much the app is used. Asking for an hour would not produce hourly
		 * refreshes, it would be a wish quietly ignored — and a deck whose intervals are
		 * measured in days does not need one.
		 */
		expect(REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(12 * 60 * 60 * 1000);
	});
});
