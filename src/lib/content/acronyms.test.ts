import { describe, expect, it } from 'vitest';
import type { TermIndexEntry } from '@aba/content-schema';
import {
	abbrKey,
	buildAbbreviations,
	byLetter,
	expandsName,
	filterAbbreviations,
	isAbbreviation
} from './acronyms.js';

function term(i: string, t: string, a: string[]): TermIndexEntry {
	return { i, t, a, c: 'principles', g: `What ${t} means.`, b: 1, r: [], f: true };
}

describe('isAbbreviation', () => {
	it('takes anything with two capitals and no spaces', () => {
		for (const s of ['MO', 'DRO', 'MSWO', 'SD', 'FR1', 'SR+', 'S-Delta', 'HIPAA']) {
			expect(isAbbreviation(s), s).toBe(true);
		}
	});

	it('leaves ordinary aliases and proper nouns alone', () => {
		// One capital does not separate a surname from an initialism, so two is the floor.
		for (const s of ['Premack', 'escape', 'free operant preference assessment', '', 'a']) {
			expect(isAbbreviation(s), s).toBe(false);
		}
	});
});

describe('abbrKey', () => {
	it('keeps a trailing sign, because SR+ and SR- are opposites', () => {
		expect(abbrKey('SR+')).toBe('sr+');
		expect(abbrKey('SR-')).toBe('sr-');
		expect(abbrKey('SR+')).not.toBe(abbrKey('SR-'));
	});

	it('folds spellings of the same notation together', () => {
		expect(abbrKey('SΔ')).toBe(abbrKey('S-Delta'));
		expect(abbrKey('IOA')).toBe('ioa');
	});
});

describe('expandsName', () => {
	it('matches initials', () => {
		expect(expandsName('DTT', 'Discrete Trial Training')).toBe(true);
		expect(expandsName('BST', 'Behavioral Skills Training')).toBe(true);
		// IOA reaches its O inside the compound word: inter-O-bserver.
		expect(expandsName('IOA', 'Interobserver Agreement')).toBe(true);
		// ABC is a real abbreviation whose letters spell out something else entirely.
		expect(expandsName('ABC', 'Three-Term Contingency')).toBe(false);
	});

	it('steps over function words', () => {
		// DRA skips the "of" in its own name; DRO matches it directly.
		expect(expandsName('DRA', 'Differential Reinforcement of Alternative Behavior')).toBe(
			true
		);
		expect(expandsName('DRO', 'Differential Reinforcement of Other Behavior')).toBe(true);
		expect(expandsName('MTS', 'Matching-to-Sample')).toBe(true);
	});

	it('continues inside a word, which is where the O of MSWO comes from', () => {
		expect(expandsName('MSWO', 'Multiple-Stimulus Without Replacement')).toBe(true);
		expect(expandsName('MSW', 'Multiple-Stimulus With Replacement')).toBe(true);
	});

	it('does not let FA expand Functional Behavior Assessment', () => {
		/*
		 * The case this rule exists for. "A" can be found inside "FunctionAl", and a looser
		 * matcher accepts it — which would have the page assert that FA means FBA. They are
		 * different things and conflating them is the classic error in this subject.
		 */
		expect(expandsName('FA', 'Functional Behavior Assessment')).toBe(false);
		expect(expandsName('FA', 'Functional Analysis')).toBe(true);
	});

	it('rejects an abbreviation that only points at a broader term', () => {
		expect(expandsName('MSWO', 'Preference Assessment')).toBe(false);
		expect(expandsName('FCT', 'Differential Reinforcement of Alternative Behavior')).toBe(
			false
		);
		expect(expandsName('AO', 'Motivating Operation')).toBe(false);
	});

	it('says no for notation, which spells nothing out', () => {
		expect(expandsName('SD', 'Discriminative Stimulus')).toBe(false);
		expect(expandsName('SR+', 'Positive Reinforcement')).toBe(false);
	});
});

describe('buildAbbreviations', () => {
	const index = [
		term('functional-analysis', 'Functional Analysis', ['FA', 'analog assessment']),
		term('functional-behavior-assessment', 'Functional Behavior Assessment', ['FBA', 'FA']),
		term('matching-to-sample', 'Matching-to-Sample', ['MTS']),
		term('momentary-time-sampling', 'Momentary Time Sampling', ['MTS']),
		term('positive-reinforcement', 'Positive Reinforcement', ['SR+', 'reinforcement']),
		term('negative-reinforcement', 'Negative Reinforcement', ['SR-'])
	];

	it('puts the expansion before the term the letters merely lead to', () => {
		const fa = buildAbbreviations(index).find((a) => a.key === 'fa');
		expect(fa?.senses.map((s) => s.term)).toEqual([
			'Functional Analysis',
			'Functional Behavior Assessment'
		]);
		expect(fa?.senses[0].expands).toBe(true);
		expect(fa?.senses[1].expands).toBe(false);
		// One real expansion, so this is not the reader's ambiguity to resolve.
		expect(fa?.ambiguous).toBe(false);
	});

	it('marks a genuinely ambiguous abbreviation rather than picking one', () => {
		const mts = buildAbbreviations(index).find((a) => a.key === 'mts');
		expect(mts?.ambiguous).toBe(true);
		expect(mts?.senses.every((s) => s.expands)).toBe(true);
		expect(mts?.senses).toHaveLength(2);
	});

	it('never merges the two reinforcement notations', () => {
		const keys = buildAbbreviations(index).map((a) => a.key);
		expect(keys).toContain('sr+');
		expect(keys).toContain('sr-');
	});

	it('does not mark a lone notation sense as merely related', () => {
		/*
		 * SR+ spells nothing out — it is notation — but it is unambiguously what positive
		 * reinforcement is written as. Flagging its only sense would read as the app not
		 * knowing what the letters mean.
		 */
		const built = buildAbbreviations(index);
		const srPlus = built.find((a) => a.key === 'sr+');
		expect(srPlus?.hasExpansion).toBe(false);
		expect(srPlus?.senses).toHaveLength(1);

		// Whereas FA has a true expansion, so the other sense is worth distinguishing.
		expect(built.find((a) => a.key === 'fa')?.hasExpansion).toBe(true);
	});

	it('ignores aliases that are not abbreviations', () => {
		const keys = buildAbbreviations(index).map((a) => a.key);
		expect(keys).not.toContain('reinforcement');
		expect(keys).not.toContain('analogassessment');
	});

	it('is sorted, and groups A-Z', () => {
		const built = buildAbbreviations(index);
		expect(built.map((a) => a.key)).toEqual([...built.map((a) => a.key)].sort());
		expect(byLetter(built).map((g) => g.letter)).toEqual(['F', 'M', 'S']);
	});
});

describe('filterAbbreviations', () => {
	const index = [
		term('momentary-time-sampling', 'Momentary Time Sampling', ['MTS']),
		term('partial-interval-recording', 'Partial-Interval Recording', ['PIR'])
	];
	const all = buildAbbreviations(index);

	it('matches the letters from the start', () => {
		expect(filterAbbreviations(all, 'mt').map((a) => a.abbr)).toEqual(['MTS']);
	});

	it('also matches the words, for somebody who forgot the letters', () => {
		expect(filterAbbreviations(all, 'interval').map((a) => a.abbr)).toEqual(['PIR']);
	});

	it('returns everything for an empty query', () => {
		expect(filterAbbreviations(all, '   ')).toHaveLength(2);
	});
});
