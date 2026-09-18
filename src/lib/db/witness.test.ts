import { describe, expect, it } from 'vitest';
import {
	assess,
	daysSinceSeen,
	parseWitness,
	serialiseWitness,
	type Witness
} from './witness.js';

const NOW = Date.parse('2026-09-18T12:00:00Z');
const DAY = 86_400_000;

describe('reading a stored witness', () => {
	it('comes back from what it wrote', () => {
		const w: Witness = { seenAt: NOW };
		expect(parseWitness(serialiseWitness(w))).toEqual(w);
	});

	it('reads anything it did not write as absent, never as a loss', () => {
		/*
		 * The worst possible false positive. Telling somebody their data was wiped on the
		 * strength of a corrupt value sends them looking for a backup they never needed,
		 * and teaches them the app cries wolf — after which the true warning is ignored too.
		 */
		for (const junk of [null, '', 'not json', '42', '"a string"', '[]', '{}']) {
			expect(parseWitness(junk)).toBeNull();
		}
	});

	it('refuses a malformed timestamp', () => {
		for (const bad of [
			{ seenAt: 0 },
			{ seenAt: -1 },
			{ seenAt: 'yesterday' },
			{ seenAt: NaN }
		]) {
			expect(parseWitness(JSON.stringify(bad))).toBeNull();
		}
	});
});

describe('what the two facts mean together', () => {
	const witness: Witness = { seenAt: NOW - 9 * DAY };

	it('says nothing to a first-time reader', () => {
		expect(assess(null, false)).toBe('fresh');
	});

	it('says data is present, and has been seen before', () => {
		expect(assess(witness, true)).toBe('present');
	});

	it('marks data that exists but was never witnessed', () => {
		// The first run after this shipped: everybody with a deck lands here once, and the
		// only correct action is to start witnessing rather than to announce anything.
		expect(assess(null, true)).toBe('unwitnessed');
	});

	it('reports a clearance only when something was actually seen before', () => {
		expect(assess(witness, false)).toBe('cleared');
	});

	it('never reports a clearance when the database could not be opened', () => {
		/*
		 * Blocked storage and a private window both look like "no data" from the outside,
		 * and the data may be sitting untouched behind a door this session cannot open.
		 * Telling somebody it was cleared would be wrong as well as alarming.
		 */
		expect(assess(witness, null)).toBe('unknown');
		expect(assess(null, null)).toBe('unknown');
	});
});

describe('how long ago it was seen', () => {
	it('counts whole days', () => {
		expect(daysSinceSeen({ seenAt: NOW - 9 * DAY - 3600_000 }, NOW)).toBe(9);
	});

	it('reports zero rather than a negative for a clock that moved backwards', () => {
		expect(daysSinceSeen({ seenAt: NOW + DAY }, NOW)).toBe(0);
	});
});
