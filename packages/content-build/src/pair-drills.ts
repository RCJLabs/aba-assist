import { createHash } from 'node:crypto';
import type { PairDrill, Term } from '@aba/content-schema';

/**
 * Build the "which of these two is it?" bank out of the confusable pairs already in the
 * corpus.
 *
 * The premise: `contrastWith` is the author saying *this is the term people mix this one
 * up with*, and the validator already holds it symmetric, so the pairs are a real graph
 * rather than a wish list. An `example` is prose written to illustrate exactly one member
 * of a pair. Put the two names under it and you have a discrimination item whose answer
 * key is not a judgement call — it is which file the example came from.
 *
 * That is the whole reason this is worth doing: the pedagogy that costs the most to write
 * is already written, and none of this reaches the review queue as new prose.
 *
 * `nonExamples` are deliberately not used, and the reason is not squeamishness. A
 * non-example of A is only guaranteed to be *not A*; it is not guaranteed to be B. Some
 * are ("that is most-to-least"), many are neither member of the pair, and nothing in the
 * schema distinguishes the two cases. Generating items from them would produce a bank
 * with silently wrong answers, which is the single failure mode that makes a study app
 * worthless — and the one the incumbents are reviewed badly for.
 */

/**
 * What building an item actually needs.
 *
 * Narrower than `Term` on purpose. A `Term` carries citations, attestation, review state
 * and provenance, none of which this reads, and depending on the whole shape would mean
 * every test here had to construct a publishable glossary entry to check a string match.
 * `Term[]` still satisfies it, so the compiler passes its real list unchanged.
 */
export type PairSource = Pick<
	Term,
	'id' | 'term' | 'aliases' | 'abbreviation' | 'category' | 'contrastWith' | 'examples'
>;

/** A term reduced to the names that would give its identity away. */
interface Names {
	/** Term, aliases and abbreviation, normalised for matching. */
	spoken: string[];
	/** The abbreviation, matched case-sensitively and whole-word. */
	abbreviation: string | null;
}

/**
 * Lowercase, and reduce every run of non-alphanumerics to one space, padded.
 *
 * The padding is what makes a substring test a word test: " rate " does not match
 * "generate", and "least-to-most" and "least to most" normalise to the same thing, which
 * matters because the corpus writes both.
 */
const normalise = (text: string): string =>
	` ${text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()} `;

const namesOf = (t: PairSource): Names => ({
	spoken: [t.term, ...t.aliases, ...(t.abbreviation ? [t.abbreviation] : [])].map(normalise),
	abbreviation: t.abbreviation
});

/**
 * Does this prompt name either answer?
 *
 * Roughly one example in twelve does, and always for a good reason — a glossary example
 * for `latency` ends "so the latency was six seconds", which is exactly what an example
 * should say and exactly what a question must not. Left in, those items are not hard
 * questions, they are free marks, and a bank where a twelfth of the items are free is a
 * bank whose score means nothing.
 */
export function revealsAnswer(prompt: string, first: PairSource, second: PairSource): boolean {
	const [a, b] = [namesOf(first), namesOf(second)];
	const hay = normalise(prompt);
	if ([...a.spoken, ...b.spoken].some((name) => hay.includes(name))) return true;
	// Abbreviations are matched against the raw text and case-sensitively: "SD" is a term
	// and "sd" inside a word is not, and lowercasing first would conflate them.
	return [a.abbreviation, b.abbreviation]
		.filter((x): x is string => x !== null)
		.some((abbr) =>
			new RegExp(`\\b${abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(prompt)
		);
}

/**
 * Where this item's answer sits in the emitted pair. Stable for a given id.
 *
 * The runtime shuffles anyway, so this does not decide what a reader sees. It decides
 * what the *file* looks like, and the file is read by whoever debugs this bank next: a
 * `pair-drills.json` whose answer is always `o[0]` hides a whole class of builder bug
 * behind a shuffle that happens somewhere else. Same derivation as
 * `scripts/balance-question-options.mjs`, for the same reason.
 */
const answerSlot = (id: string): 0 | 1 =>
	createHash('sha256').update(id).digest().readUInt32BE(0) % 2 === 0 ? 0 : 1;

export function buildPairDrills(terms: PairSource[]): PairDrill[] {
	const byId = new Map(terms.map((t) => [t.id, t]));
	const drills: PairDrill[] = [];

	for (const term of terms) {
		for (const otherId of term.contrastWith) {
			const other = byId.get(otherId);
			// A partner that was withheld while this term shipped. Not an error — that is
			// the release gate working — but there is no second option to offer, so the
			// pair simply does not produce items this build.
			if (!other) continue;

			for (const [index, example] of term.examples.entries()) {
				if (revealsAnswer(example.text, term, other)) continue;

				// The partner is part of the id, not decoration: a term with two declared
				// confusables turns one example into two items, and twenty-four terms in
				// the corpus have exactly that. Keyed on the example alone they would
				// collide, and the second would silently overwrite the first wherever
				// these are held by id.
				const id = `${term.id}--${index}--${otherId}`;
				const options: [string, string] =
					answerSlot(id) === 0 ? [term.id, otherId] : [otherId, term.id];

				drills.push({
					i: id,
					p: example.text,
					o: options,
					k: term.id,
					c: term.category
				});
			}
		}
	}

	// Sorted so the emitted file is stable across builds: the input order is directory
	// order, and a reordered artifact invalidates its own precache entry for nothing.
	return drills.sort((a, b) => a.i.localeCompare(b.i) || a.o[0].localeCompare(b.o[0]));
}
