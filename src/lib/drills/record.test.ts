import { describe, expect, it } from 'vitest';
import type { PairQuestion } from './pairs.js';
import { pairKey, toAttempt } from './record.js';

const q = (id: string, a: string, b: string, answer = a): PairQuestion => ({
	id,
	prompt: `Prompt ${id}`,
	options: [a, b],
	answer,
	category: 'principles'
});

describe('pairKey', () => {
	/*
	 * A confusion is undirected. Mistaking A for B and B for A are the same gap in the
	 * reader's understanding, and keying them separately would halve every count on the
	 * progress page while looking perfectly plausible.
	 */
	it('is the same key whichever way round the pair was shown', () => {
		expect(pairKey(q('1', 'dro', 'dra'))).toBe(pairKey(q('2', 'dra', 'dro')));
	});
});

describe('toAttempt', () => {
	const sitting = {
		startedAt: 1_000,
		questions: [q('a', 'dro', 'dra'), q('b', 'dra', 'dro'), q('c', 'x', 'y')],
		missed: [q('a', 'dro', 'dra'), q('b', 'dra', 'dro')],
		categories: ['reduction']
	};

	it('scores the sitting from what was not missed', () => {
		expect(toAttempt(sitting, 2_000)).toMatchObject({
			kind: 'pairs',
			total: 3,
			correct: 1,
			startedAt: 1_000,
			finishedAt: 2_000,
			categories: ['reduction']
		});
	});

	/*
	 * Both directions of one pair in one sitting is one confusion met twice, not two
	 * confusions. Counting it twice would let a single sitting push a pair over the
	 * "more than once" bar on its own, which is exactly the bar's purpose.
	 */
	it('counts one pair once however many times it came up', () => {
		expect(toAttempt(sitting, 2_000).missedPairs).toEqual(['dra|dro']);
	});

	it('gives sittings distinct ids', () => {
		const other = { ...sitting, startedAt: 9_999 };
		expect(toAttempt(sitting, 2_000).id).not.toBe(toAttempt(other, 2_000).id);
	});

	it('records a clean sitting with nothing confused', () => {
		const clean = { ...sitting, missed: [] };
		expect(toAttempt(clean, 2_000)).toMatchObject({ correct: 3, missedPairs: [] });
	});
});
