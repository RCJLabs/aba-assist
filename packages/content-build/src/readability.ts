/**
 * Flesch–Kincaid grade level.
 *
 * Used only to police the plain-language fields. Readability formulas are crude — they
 * count syllables, not comprehension — so this is a warning-level signal in most cases
 * and a hard gate only on `definition.plain`, where the whole point of the field is that
 * a new technician or a paraeducator can read it.
 */

function countSyllables(word: string): number {
	const w = word.toLowerCase().replace(/[^a-z]/g, '');
	if (!w) return 0;
	if (w.length <= 3) return 1;
	const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
	const groups = trimmed.match(/[aeiouy]{1,2}/g);
	return Math.max(1, groups ? groups.length : 1);
}

export interface Readability {
	grade: number;
	words: number;
	sentences: number;
}

export function fleschKincaidGrade(text: string): Readability {
	const clean = text.replace(/\s+/g, ' ').trim();
	const sentences = Math.max(1, (clean.match(/[.!?]+(?:\s|$)/g) ?? []).length);
	const words = clean.split(/\s+/).filter(Boolean);
	if (words.length === 0) return { grade: 0, words: 0, sentences };
	const syllables = words.reduce((n, w) => n + countSyllables(w), 0);
	const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
	return { grade: Math.round(grade * 10) / 10, words: words.length, sentences };
}

/** Crude trigram similarity, for catching two terms defined in near-identical prose. */
export function trigramSimilarity(a: string, b: string): number {
	const grams = (s: string) => {
		const t = s.toLowerCase().replace(/\s+/g, ' ').trim();
		const set = new Set<string>();
		for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
		return set;
	};
	const ga = grams(a);
	const gb = grams(b);
	if (ga.size === 0 || gb.size === 0) return 0;
	let shared = 0;
	for (const g of ga) if (gb.has(g)) shared++;
	return (2 * shared) / (ga.size + gb.size);
}
