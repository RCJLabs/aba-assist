import { describe, expect, it } from 'vitest';
import { newCard, type CardRecord } from '$lib/db/scheduler.js';
import { MAX_PER_RUN, planReinforcement, termsToReinforce } from './reinforce.js';

const deck = new Set(['stimulus-control', 'extinction', 'prompt-fading', 'shaping']);

describe('choosing what a missed run reinforces', () => {
	it('takes only terms that are in the flashcard deck', () => {
		const got = termsToReinforce(
			[{ termRefs: ['stimulus-control', 'not-a-term', 'hipaa'] }],
			deck
		);
		expect(got).toEqual(['stimulus-control']);
	});

	it('ranks a term cited by several missed questions above one cited once', () => {
		const got = termsToReinforce(
			[
				{ termRefs: ['shaping', 'extinction'] },
				{ termRefs: ['extinction'] },
				{ termRefs: ['extinction', 'prompt-fading'] }
			],
			deck
		);
		expect(got[0]).toBe('extinction');
	});

	it('caps what one run may add, so a bad session does not become a wall', () => {
		const big = new Set(Array.from({ length: 60 }, (_, i) => `t${i}`));
		const missed = [...big].map((id) => ({ termRefs: [id] }));
		expect(termsToReinforce(missed, big)).toHaveLength(MAX_PER_RUN);
		expect(termsToReinforce(missed, big, 5)).toHaveLength(5);
	});

	it('returns nothing when nothing was missed', () => {
		expect(termsToReinforce([], deck)).toEqual([]);
	});
});

describe('what a missed run writes', () => {
	const now = 1_700_000_000_000;
	const day = 86_400_000;

	it('creates a card for a term that has never been studied', () => {
		const plan = planReinforcement(['shaping'], new Map(), now);
		expect(plan.created).toBe(1);
		expect(plan.writes).toHaveLength(1);
		expect(plan.writes[0].id).toBe('shaping');
		expect(plan.writes[0].due).toBeLessThanOrEqual(now);
	});

	it('pulls a card scheduled into the future forward to now', () => {
		const later: CardRecord = { ...newCard('extinction', now), due: now + 21 * day, reps: 4 };
		const plan = planReinforcement(['extinction'], new Map([['extinction', later]]), now);
		expect(plan.pulled).toBe(1);
		expect(plan.writes[0].due).toBe(now);
	});

	it('keeps the scheduling history, because a miss is not a review', () => {
		/*
		 * The whole point of the design. Grading the card "Again" would have been easier
		 * and would have written a lapse the reader never sat, which the algorithm would
		 * then reason from for months.
		 */
		const learned: CardRecord = {
			...newCard('prompt-fading', now),
			due: now + 30 * day,
			stability: 42.5,
			difficulty: 3.1,
			reps: 9,
			lapses: 1,
			state: 2
		};
		const plan = planReinforcement(
			['prompt-fading'],
			new Map([['prompt-fading', learned]]),
			now
		);
		const written = plan.writes[0];
		expect(written.stability).toBe(42.5);
		expect(written.difficulty).toBe(3.1);
		expect(written.reps).toBe(9);
		expect(written.lapses).toBe(1);
		expect(written.state).toBe(2);
		expect(written.due).toBe(now);
	});

	it('leaves a card that is already due alone', () => {
		const due: CardRecord = { ...newCard('shaping', now), due: now - day };
		const plan = planReinforcement(['shaping'], new Map([['shaping', due]]), now);
		expect(plan.untouched).toBe(1);
		expect(plan.writes).toEqual([]);
	});
});
