/**
 * Seeded pseudo-randomness.
 *
 * Two features need a sequence that comes out the same every time it is asked for, for
 * unrelated reasons. The tier C review draw has to be reproducible so that a build and a
 * reviewer agree on which items were sampled. A data-taking rehearsal has to be
 * replayable, so a reader can run the same two minutes again with a different recording
 * method and compare the numbers rather than guess at them.
 *
 * Neither wants cryptographic quality, and both want the same dozen lines. Kept together
 * so they cannot drift into two generators that disagree about what a seed means.
 */

/** A small, fast, deterministic string hash. */
export function hash(seed: string): number {
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	return h >>> 0;
}

/**
 * mulberry32, in the shape `Math.random` already has.
 *
 * Returning the same signature matters: every generator in this app takes an `Rng` with
 * `Math.random` as its default, so a seeded run and an unseeded one are the same code
 * path rather than two.
 */
export function mulberry32(seed: number): () => number {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** The generator for a named seed, which is how both callers actually ask for one. */
export const rngFor = (seed: string): (() => number) => mulberry32(hash(seed));
