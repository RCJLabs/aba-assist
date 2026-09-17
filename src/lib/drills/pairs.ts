import type { PairDrill, TermCategory } from '@aba/content-schema';

/**
 * Turning the generated bank into a sitting.
 *
 * The bank itself is built at compile time (`packages/content-build/src/pair-drills.ts`).
 * What is left is the part that has to be right for a reader rather than for a file:
 * which items they get, in what order, and which of the two names appears first.
 *
 * Kept pure and separate from the route for the same reason `calc.ts` is — selection and
 * ordering are where the quiet bugs live, and a bug that only reproduces after tapping
 * through fifteen questions is not one anybody finds twice.
 */

export interface PairQuestion {
	id: string;
	/** The example, exactly as its glossary entry states it. */
	prompt: string;
	/** The two term ids, in the order they should be shown. */
	options: [string, string];
	/** Which of `options` is right. */
	answer: string;
	category: TermCategory;
}

/** Injected so tests are deterministic; the route passes `Math.random`. */
export type Random = () => number;

const shuffled = <T>(items: readonly T[], random: Random): T[] => {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j]!, out[i]!];
	}
	return out;
};

/** The pair an item belongs to, direction-independent. */
const pairKey = (d: PairDrill): string => [...d.o].sort().join('|');

/**
 * Push apart items drawn from the same pair.
 *
 * Both directions of a pair are worth asking — knowing that *this* is negative
 * reinforcement is not the same as knowing that *that* is punishment — but asking them
 * back to back turns the second one into a freebie, because the answer to the first is
 * still on screen in the reader's head. One forward pass, swapping a clash with the next
 * item that does not clash, is enough: it never loops and never drops anything.
 */
function spreadPairs(items: PairDrill[]): PairDrill[] {
	const out = [...items];
	for (let i = 1; i < out.length; i++) {
		if (pairKey(out[i]!) !== pairKey(out[i - 1]!)) continue;
		const swap = out.findIndex(
			(cand, j) =>
				j > i &&
				pairKey(cand) !== pairKey(out[i - 1]!) &&
				(j + 1 >= out.length || pairKey(out[j + 1]!) !== pairKey(out[i]!))
		);
		if (swap !== -1) [out[i], out[swap]] = [out[swap]!, out[i]!];
	}
	return out;
}

export interface SessionOptions {
	/** Empty means every area. */
	categories?: readonly TermCategory[];
	size?: number;
}

/**
 * Draw a sitting from the bank.
 *
 * Shorter than asked for when the filter leaves fewer items — a reader who picks one
 * narrow area gets what exists rather than repeats, because a drill that asks the same
 * question twice in one sitting teaches the answer rather than the distinction.
 */
export function buildSession(
	bank: readonly PairDrill[],
	{ categories = [], size = 15 }: SessionOptions = {},
	random: Random = Math.random
): PairQuestion[] {
	const pool =
		categories.length > 0 ? bank.filter((d) => categories.includes(d.c)) : [...bank];

	return spreadPairs(shuffled(pool, random).slice(0, size)).map((d) => {
		// Shuffled per sitting rather than taken from the file: the emitted order is
		// balanced across the bank, which is not the same as being unguessable within one
		// reader's session.
		const options: [string, string] = random() < 0.5 ? [d.o[0], d.o[1]] : [d.o[1], d.o[0]];
		return { id: d.i, prompt: d.p, options, answer: d.k, category: d.c };
	});
}

/** Which areas this build can actually drill, with a count, for the picker. */
export function availableCategories(bank: readonly PairDrill[]): Map<TermCategory, number> {
	const counts = new Map<TermCategory, number>();
	for (const d of bank) counts.set(d.c, (counts.get(d.c) ?? 0) + 1);
	return counts;
}

/**
 * The terms to make due again after a miss: both of them, always.
 *
 * Reinforcing only the right answer would be reading the failure as "did not know
 * negative reinforcement", when what it actually shows is that these two are not yet
 * told apart — and the one the reader wrongly chose is half of that.
 */
export function termsBehind(question: PairQuestion): string[] {
	return [...question.options];
}
