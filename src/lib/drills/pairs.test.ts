import { describe, expect, it } from 'vitest';
import type { PairDrill } from '@aba/content-schema';
import { availableCategories, buildSession, termsBehind } from './pairs.js';

const drill = (
	i: string,
	a: string,
	b: string,
	c: PairDrill['c'] = 'principles'
): PairDrill => ({
	i,
	p: `Prompt ${i}`,
	o: [a, b],
	k: a,
	c
});

/** A deterministic stand-in for Math.random, cycling through fixed values. */
const rng = (values: number[]) => {
	let n = 0;
	return () => values[n++ % values.length]!;
};

describe('buildSession', () => {
	const bank = Array.from({ length: 40 }, (_, n) => drill(`d${n}`, `a${n}`, `b${n}`));

	it('draws the requested number and never repeats an item', () => {
		const session = buildSession(bank, { size: 10 }, rng([0.1, 0.7, 0.3, 0.9]));
		expect(session).toHaveLength(10);
		expect(new Set(session.map((q) => q.id)).size).toBe(10);
	});

	/*
	 * A reader who picks one narrow area should get what exists, not the same question
	 * twice. Padding a short pool back up to the requested size would teach the answer
	 * rather than the distinction.
	 */
	it('returns a short sitting rather than repeating when the filter is narrow', () => {
		const narrow = [drill('x', 'a', 'b', 'ethics'), drill('y', 'c', 'd', 'ethics')];
		const session = buildSession([...bank, ...narrow], { categories: ['ethics'], size: 15 });
		expect(session).toHaveLength(2);
		expect(session.every((q) => q.category === 'ethics')).toBe(true);
	});

	it('keeps the answer and the prompt attached to the right item', () => {
		const session = buildSession([drill('only', 'shaping', 'chaining')], { size: 1 });
		expect(session[0]).toMatchObject({
			id: 'only',
			prompt: 'Prompt only',
			answer: 'shaping'
		});
		expect([...session[0]!.options].sort()).toEqual(['chaining', 'shaping']);
	});

	/*
	 * The emitted file is balanced across the whole bank, which is not the same as being
	 * unguessable inside one sitting: without this, every item a reader sees would put the
	 * answer wherever the compiler left it, and a bank is only ever balanced on average.
	 */
	it('shuffles which option is shown first', () => {
		const one = [drill('only', 'first', 'second')];
		const left = buildSession(one, { size: 1 }, () => 0.2);
		const right = buildSession(one, { size: 1 }, () => 0.8);
		expect(left[0]!.options[0]).not.toBe(right[0]!.options[0]);
	});

	/*
	 * Both directions of a pair are worth asking; asking them back to back is not, because
	 * the answer to the first is still in the reader's head when the second arrives.
	 */
	it('does not put two items from the same pair next to each other', () => {
		const sameP = [
			drill('p1', 'x', 'y'),
			drill('p2', 'y', 'x'),
			drill('q1', 'm', 'n'),
			drill('q2', 'n', 'm')
		];
		// An ordering that would otherwise pair them up adjacently.
		const session = buildSession(sameP, { size: 4 }, () => 0);
		const key = (q: { options: [string, string] }) => [...q.options].sort().join('|');
		for (let i = 1; i < session.length; i++) {
			expect(key(session[i]!), `items ${i - 1} and ${i}`).not.toBe(key(session[i - 1]!));
		}
	});

	it('is empty when nothing in the build matches the filter', () => {
		expect(buildSession(bank, { categories: ['verbal-behavior'] })).toEqual([]);
	});
});

describe('availableCategories', () => {
	it('counts what each area can actually offer', () => {
		const counts = availableCategories([
			drill('a', '1', '2', 'ethics'),
			drill('b', '3', '4', 'ethics'),
			drill('c', '5', '6', 'measurement')
		]);
		expect(counts.get('ethics')).toBe(2);
		expect(counts.get('measurement')).toBe(1);
		expect(counts.has('principles')).toBe(false);
	});
});

describe('termsBehind', () => {
	/*
	 * Both, not just the correct one. A miss here does not mean "did not know negative
	 * reinforcement" — it means these two are not yet told apart, and the term wrongly
	 * chosen is half of what needs revisiting.
	 */
	it('names both terms of the pair, so a miss revisits the confusion', () => {
		const [q] = buildSession([drill('only', 'punishment', 'negative-reinforcement')], {
			size: 1
		});
		expect(termsBehind(q!).sort()).toEqual(['negative-reinforcement', 'punishment']);
	});
});
