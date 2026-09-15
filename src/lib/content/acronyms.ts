import type { TermIndexEntry } from '@aba/content-schema';

/**
 * The abbreviation index, derived rather than written.
 *
 * Every entry here comes from an alias already on a glossary term, so this adds no content
 * and nothing new to review: it is a second way into the corpus, not more corpus. The
 * consequence is that its coverage is exactly the glossary's coverage, which the page says
 * out loud rather than implying it knows every abbreviation in the field.
 */

/** Words an abbreviation is allowed to step over: "DRA" skips the "of" in its own name. */
const SKIPPABLE = new Set([
	'of',
	'the',
	'a',
	'an',
	'to',
	'for',
	'and',
	'in',
	'on',
	'with',
	'by',
	'from'
]);

/**
 * An alias is an abbreviation if it is short, unspaced and carries at least two capitals.
 *
 * Two capitals rather than one: "Premack" and "Skinner" are proper nouns that appear as
 * aliases, and a single capital does not distinguish them from "MO". Notation like "SD"
 * qualifies, which is intended — somebody who meets it in a plan needs it decoded just as
 * much as an initialism.
 */
export function isAbbreviation(alias: string): boolean {
	const trimmed = alias.trim();
	if (trimmed.length === 0 || trimmed.length > 10) return false;
	if (/\s/.test(trimmed)) return false;
	return (trimmed.match(/\p{Lu}/gu) ?? []).length >= 2;
}

/** Just the letters and digits, for matching an abbreviation against a name. */
function lettersOf(abbr: string): string {
	return abbr
		.toLowerCase()
		.replace(/[\u0394\u03b4]/g, 'delta')
		.replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * The identity of an abbreviation, for grouping and lookup.
 *
 * A trailing sign is part of the abbreviation and is kept: SR+ and SR- are the notation
 * for positive and negative reinforcement, so folding them together would merge the two
 * entries this page most has to keep apart. Everything else that is not a letter or digit
 * is a spelling choice rather than meaning, so "S-Delta" and "S\u0394" are one entry.
 */
export function abbrKey(abbr: string): string {
	const trimmed = abbr.trim();
	const sign = /[+\-\u2212]$/.test(trimmed) ? trimmed.slice(-1).replace('\u2212', '-') : '';
	return lettersOf(trimmed) + sign;
}

function words(name: string): string[] {
	return name
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
}

/**
 * Does this abbreviation spell out this term's name?
 *
 * The question matters because an alias says only that the abbreviation *leads here*, not
 * that it stands for this. "MSWO" is an alias of both Multiple-Stimulus Without
 * Replacement and Preference Assessment; it expands the first and merely points at the
 * second, and a decoder that cannot tell them apart teaches the reader the broader term is
 * what the letters mean.
 *
 * A letter may start the next word, continue inside the word its predecessor matched — the
 * "O" of MSWO comes from withOut — or step over function words. The words consumed must be
 * consecutive from the start, and at least two of them, which is what keeps "FA" from
 * matching the "F" and the "a" inside Functional Behavior Assessment. That pair is the one
 * this has to get right: FA and FBA are different things, and conflating them is the
 * classic error this app exists to not repeat.
 */
export function expandsName(abbr: string, termName: string): boolean {
	const letters = lettersOf(abbr);
	const ws = words(termName);
	if (letters.length < 2 || ws.length === 0) return false;

	// (letter index, word index, offset within that word) -> reachable
	const seen = new Set<string>();

	function walk(li: number, wi: number, within: number, consumed: number): boolean {
		if (li === letters.length) return consumed >= 2;
		if (wi >= ws.length) return false;
		const key = `${li}:${wi}:${within}`;
		if (seen.has(key)) return false;
		seen.add(key);

		const ch = letters[li];

		// Continue inside the word the previous letter matched.
		if (within > 0) {
			const at = ws[wi].indexOf(ch, within);
			if (at !== -1 && walk(li + 1, wi, at + 1, consumed)) return true;
		}

		// Start the next word, optionally stepping over function words on the way.
		for (let next = wi + (within > 0 ? 1 : 0); next < ws.length; next++) {
			if (ws[next].startsWith(ch) && walk(li + 1, next, 1, consumed + 1)) return true;
			// Only function words may be stepped over, and only after the first match.
			if (within === 0 && next === wi) continue;
			if (!SKIPPABLE.has(ws[next])) break;
		}
		return false;
	}

	// The first letter has to start a word, and the match runs from there.
	for (let start = 0; start < ws.length; start++) {
		if (ws[start].startsWith(letters[0]) && walk(1, start, 1, 1)) return true;
	}
	return false;
}

export type AbbreviationSense = {
	id: string;
	term: string;
	category: string;
	gloss: string;
	/** Whether the letters spell this term out, as opposed to merely leading here. */
	expands: boolean;
};

export type Abbreviation = {
	/** The display form, preferring the spelling with the most capitals ("SD" over "Sd"). */
	abbr: string;
	key: string;
	senses: AbbreviationSense[];
	/** Two or more things the letters genuinely stand for, like MTS. */
	ambiguous: boolean;
	/**
	 * Whether any sense is a real expansion.
	 *
	 * False for notation — SD, SR+, ABC — where the letters spell out nothing in the term's
	 * name but unambiguously mean it. The distinction between an expansion and a term the
	 * letters merely lead to is only worth drawing inside an entry that has both, so this
	 * is what stops a lone sense being labelled as though the app were unsure of it.
	 */
	hasExpansion: boolean;
};

/**
 * Build the index.
 *
 * Senses are ordered expansions first, so the reader meets what the letters stand for
 * before what else they might lead to. Where several senses expand the name, the
 * abbreviation is ambiguous in the field itself and the page says so rather than picking.
 */
export function buildAbbreviations(index: TermIndexEntry[]): Abbreviation[] {
	const byKey = new Map<string, { spellings: string[]; senses: AbbreviationSense[] }>();

	for (const entry of index) {
		for (const alias of entry.a) {
			if (!isAbbreviation(alias)) continue;
			const key = abbrKey(alias);
			const bucket = byKey.get(key) ?? { spellings: [], senses: [] };
			bucket.spellings.push(alias.trim());
			if (!bucket.senses.some((s) => s.id === entry.i)) {
				bucket.senses.push({
					id: entry.i,
					term: entry.t,
					category: entry.c,
					gloss: entry.g,
					expands: expandsName(alias, entry.t)
				});
			}
			byKey.set(key, bucket);
		}
	}

	const out: Abbreviation[] = [];
	for (const [key, bucket] of byKey) {
		const senses = [...bucket.senses].sort((a, b) =>
			a.expands === b.expands ? a.term.localeCompare(b.term) : a.expands ? -1 : 1
		);
		const capitals = (s: string) => (s.match(/\p{Lu}/gu) ?? []).length;
		const abbr = [...bucket.spellings].sort(
			(a, b) => capitals(b) - capitals(a) || a.length - b.length || a.localeCompare(b)
		)[0];
		const expansions = senses.filter((s) => s.expands).length;
		out.push({
			abbr,
			key,
			senses,
			ambiguous: expansions > 1,
			hasExpansion: expansions > 0
		});
	}
	/*
	 * Sorted by key with a plain comparison rather than localeCompare: keys are machine
	 * identity — lowercase letters, digits and an optional trailing sign — so collation
	 * rules buy nothing here and would let the order differ between one environment and
	 * another. Names are still compared with locale rules, since those are read.
	 */
	return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Group A–Z for scanning, which is the half of this a search box cannot do. */
export function byLetter(list: Abbreviation[]): { letter: string; items: Abbreviation[] }[] {
	const groups = new Map<string, Abbreviation[]>();
	for (const a of list) {
		const letter = a.abbr[0].toUpperCase();
		groups.set(letter, [...(groups.get(letter) ?? []), a]);
	}
	return [...groups.entries()]
		.map(([letter, items]) => ({ letter, items }))
		.sort((x, y) => x.letter.localeCompare(y.letter));
}

/**
 * Filter as the reader types.
 *
 * Matches the letters and the expansions both, so "time" finds MTS and PTI even though
 * neither contains the word — somebody who half-remembers the words but not the letters is
 * exactly who needs this page.
 */
export function filterAbbreviations(list: Abbreviation[], query: string): Abbreviation[] {
	const q = query.trim().toLowerCase();
	if (q === '') return list;
	const key = abbrKey(q);
	return list.filter(
		(a) =>
			(key !== '' && a.key.startsWith(key)) ||
			a.senses.some((s) => s.term.toLowerCase().includes(q))
	);
}
