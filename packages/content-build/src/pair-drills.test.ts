import { describe, expect, it } from 'vitest';
import { buildPairDrills, revealsAnswer, type PairSource } from './pair-drills.js';

/**
 * The generated discrimination bank.
 *
 * The thing worth testing here is not that items come out — it is that the ones that come
 * out are answerable only by knowing the difference. A generated bank has no reviewer
 * reading each item, so the properties a reviewer would have caught by eye have to be
 * assertions instead.
 */

const term = (over: Partial<PairSource> & { id: string }): PairSource => ({
	term: over.id,
	aliases: [],
	abbreviation: null,
	category: 'principles',
	contrastWith: [],
	examples: [
		{ text: 'A learner does the thing, and then the thing happens again.', setting: 'any' }
	],
	...over
});

const pair = (
	a: Partial<PairSource> & { id: string },
	b: Partial<PairSource> & { id: string }
) => [term({ ...a, contrastWith: [b.id] }), term({ ...b, contrastWith: [a.id] })];

describe('buildPairDrills', () => {
	it('turns an example into an item whose answer is the term that owns it', () => {
		const [drill, ...rest] = buildPairDrills(
			pair(
				{
					id: 'positive-reinforcement',
					examples: [{ text: 'Something is added.', setting: 'any' }]
				},
				{ id: 'negative-reinforcement', examples: [] }
			)
		);
		expect(rest).toHaveLength(0);
		expect(drill!.k).toBe('positive-reinforcement');
		expect(drill!.o).toContain('negative-reinforcement');
		expect(drill!.p).toBe('Something is added.');
	});

	/*
	 * The failure this is really guarding: a glossary example is *supposed* to name its
	 * term ("so the latency was six seconds"), which is exactly what makes it useless as a
	 * question. In the real corpus this drops about one candidate in twelve.
	 */
	it('drops an example that names either answer', () => {
		const drills = buildPairDrills(
			pair(
				{
					id: 'latency',
					term: 'Latency',
					examples: [
						{ text: 'They started six seconds after the instruction.', setting: 'any' },
						{ text: 'They started six seconds later, so the latency was six.', setting: 'any' }
					]
				},
				{ id: 'interresponse-time', term: 'Interresponse Time', examples: [] }
			)
		);
		expect(drills).toHaveLength(1);
		expect(drills[0]!.p).not.toMatch(/latency/i);
	});

	it('drops an example that names the term it is being contrasted against', () => {
		const drills = buildPairDrills(
			pair(
				{
					id: 'forward-chaining',
					term: 'Forward Chaining',
					examples: [
						{ text: 'Teach the last step first, unlike backward chaining.', setting: 'any' }
					]
				},
				{ id: 'backward-chaining', term: 'Backward Chaining', examples: [] }
			)
		);
		expect(drills).toHaveLength(0);
	});

	/*
	 * Twenty-four terms in the corpus declare two confusables and one declares four, so
	 * one example legitimately becomes several items. Keying them on the example alone
	 * collides, and a collision here is invisible: the bank just quietly gets smaller
	 * wherever items are held by id.
	 */
	it('gives every item its own id when one example serves two pairs', () => {
		const drills = buildPairDrills([
			term({ id: 'shaping', term: 'Shaping', contrastWith: ['chaining', 'fading'] }),
			term({ id: 'chaining', term: 'Chaining', contrastWith: ['shaping'], examples: [] }),
			term({ id: 'fading', term: 'Fading', contrastWith: ['shaping'], examples: [] })
		]);
		expect(drills).toHaveLength(2);
		expect(new Set(drills.map((d) => d.i)).size).toBe(2);
	});

	/*
	 * A partner can be withheld while its term ships — that is the release gate doing its
	 * job. There is then no second option to offer, and an item with one option is not a
	 * question.
	 */
	it('produces nothing for a pair whose other half is not in the build', () => {
		expect(buildPairDrills([term({ id: 'a', contrastWith: ['missing'] })])).toHaveLength(0);
	});

	it('is stable across builds, so the artifact does not churn its precache entry', () => {
		const input = pair({ id: 'zebra', term: 'Zebra' }, { id: 'aardvark', term: 'Aardvark' });
		expect(buildPairDrills(input)).toEqual(buildPairDrills([...input].reverse()));
	});

	/*
	 * The runtime shuffles, so this is about the file rather than the reader: a bank whose
	 * answer is always `o[0]` would look fine in the app and be wrong in the artifact, and
	 * the shuffle would hide it from every test that goes through the UI.
	 */
	it('spreads the answer across both slots', () => {
		const terms = Array.from({ length: 60 }, (_, n) =>
			term({
				id: `term-${n}`,
				term: `Concept Number ${n}`,
				contrastWith: [`term-${(n + 1) % 60}`]
			})
		);
		const drills = buildPairDrills(terms);
		const first = drills.filter((d) => d.o[0] === d.k).length;
		expect(first).toBeGreaterThan(drills.length * 0.3);
		expect(first).toBeLessThan(drills.length * 0.7);
	});
});

describe('revealsAnswer', () => {
	const mo = term({
		id: 'motivating-operation',
		term: 'Motivating Operation',
		aliases: ['establishing operation'],
		abbreviation: 'MO'
	});
	const sd = term({
		id: 'discriminative-stimulus',
		term: 'Discriminative Stimulus',
		abbreviation: 'SD'
	});

	it('catches the name, an alias, and the abbreviation', () => {
		expect(revealsAnswer('This is a motivating operation.', mo, sd)).toBe(true);
		expect(revealsAnswer('An establishing operation was in place.', mo, sd)).toBe(true);
		expect(revealsAnswer('The MO was strong that morning.', mo, sd)).toBe(true);
	});

	it('catches a name written with different punctuation', () => {
		const ltm = term({ id: 'least-to-most-prompting', term: 'Least-to-Most Prompting' });
		expect(revealsAnswer('She used least to most prompting.', ltm, sd)).toBe(true);
	});

	/*
	 * The reason the check is word-boundary rather than substring, in both directions. A
	 * rule that fires on ordinary prose gets loosened by whoever hits it next, and these
	 * are the sentences a real example is made of.
	 */
	it('leaves ordinary prose alone', () => {
		expect(revealsAnswer('The technician waited, then offered help.', mo, sd)).toBe(false);
		// "SD" inside a word, and a lowercase "mo" that is part of "moment".
		expect(revealsAnswer('In a moment the sdirected plan resumed.', mo, sd)).toBe(false);
		expect(revealsAnswer('Deprivation made the snack worth working for.', mo, sd)).toBe(false);
	});
});
