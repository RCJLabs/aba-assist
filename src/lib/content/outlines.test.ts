import { describe, expect, it } from 'vitest';
import { outlineForCredential, outlines, termIndex } from './load.js';
import { examFormat } from '$lib/quiz/simulation.js';

/**
 * The assistant-analyst outline, and the one thing that can silently break it.
 *
 * The BCaBA document numbers its tasks independently of the analyst one — B has 15 tasks
 * where the analyst outline has 24 — so a ref borrowed from the other credential points
 * at a task that exists but means something else. That is the failure this file is for:
 * it is invisible on screen, because the letter still resolves and a page still renders.
 */

const BCaBA = () => outlineForCredential('BCaBA')!;

describe('the assistant-analyst outline', () => {
	it('is the document that was read: 9 domains, 90 tasks, 150 scored questions', () => {
		const o = BCaBA();
		expect(o.domains).toHaveLength(9);
		expect(o.domains.flatMap((d) => d.tasks)).toHaveLength(90);
		expect(o.totalTasks).toBe(90);
		expect(o.countsVerified).toBe(true);
		expect(o.exam.scoredItems).toBe(150);
		expect(o.exam.unscoredItems).toBe(25);
	});

	it('adds up both ways — weights to 100, per-domain items to the scored total', () => {
		const o = BCaBA();
		const weights = o.domains.map((d) => d.examWeightPercent ?? 0);
		const items = o.domains.map((d) => d.examItems ?? 0);
		expect(weights.reduce((a, b) => a + b, 0)).toBe(100);
		expect(items.reduce((a, b) => a + b, 0)).toBe(o.exam.scoredItems);
	});

	it('is not modelled as a subset of the analyst outline, because it is not one', () => {
		const o = BCaBA();
		expect(o.subsetOf).toBeNull();

		// The two documents disagree about what the letters name and how many tasks sit
		// under them, which is the whole reason the refs cannot be shared.
		const bcba = outlineForCredential('BCBA')!;
		const nameOf = (x: typeof o, letter: string) =>
			x.domains.find((d) => d.letter === letter)!.name;
		expect(nameOf(o, 'H')).not.toBe(nameOf(bcba, 'H'));
		expect(nameOf(o, 'I')).not.toBe(nameOf(bcba, 'I'));
		expect(o.domains.find((d) => d.letter === 'B')!.tasks.length).not.toBe(
			bcba.domains.find((d) => d.letter === 'B')!.tasks.length
		);
	});

	/*
	 * This assertion used to be the opposite one.
	 *
	 * The outline publishes the question counts but not the clock, so `minutes` was null
	 * and `examFormat` returned null, which stopped the simulator offering a paper timed
	 * against a guess. That was right while the handbook was unread: a guessed pace is
	 * worse than no simulation, because pace is the one thing a simulation is for.
	 *
	 * The handbook has now been read. It gives four hours for all 175 questions including
	 * the tutorial and survey, so the refusal is retired and the figure is checked
	 * instead. `npm run content:verify` checks it against the document itself.
	 */
	it('paces a simulation from the handbook rather than a guess', () => {
		expect(BCaBA().exam.minutes).toBe(240);
		const format = examFormat(BCaBA());
		expect(format).not.toBeNull();
		// The clock covers the unscored items too, so the pace is over all 175.
		expect(format!.totalItems).toBe(175);
		expect(format!.minutes).toBe(240);
		expect(examFormat(outlineForCredential('BCBA')!)).not.toBeNull();
	});
});

describe('the terms tagged to the assistant-analyst outline', () => {
	/*
	 * The outline points at terms and the terms point back at the outline. They were
	 * written as one claim and they have to stay one claim: an edit to either side alone
	 * leaves a task with no glossary or a term filtered into an exam that never asks it.
	 */
	const fromOutline = () => {
		const pairs = new Set<string>();
		for (const d of BCaBA().domains) {
			for (const t of d.tasks) {
				for (const term of t.termRefs) pairs.add(`${term}|${t.code}`);
			}
		}
		return pairs;
	};

	const fromTerms = () => {
		const pairs = new Set<string>();
		for (const t of termIndex) {
			// Short keys: `i` is the term id, `r` its outline refs.
			for (const ref of t.r) {
				if (ref.startsWith('BCaBA:')) pairs.add(`${t.i}|${ref.slice('BCaBA:'.length)}`);
			}
		}
		return pairs;
	};

	it('agree in both directions', () => {
		const outline = fromOutline();
		const terms = fromTerms();
		expect([...outline].filter((p) => !terms.has(p)).sort()).toEqual([]);
		expect([...terms].filter((p) => !outline.has(p)).sort()).toEqual([]);
	});

	it('leave the assistant filter with something to show', () => {
		// Filtering to BCaBA used to fall back to analyst refs. It no longer can, so an
		// untagged corpus would present an empty glossary rather than a narrower one.
		const tagged = termIndex.filter((t) => t.r.some((r) => r.startsWith('BCaBA:')));
		expect(tagged.length).toBeGreaterThan(150);
	});

	it('cover every area of the outline', () => {
		const letters = new Set(
			termIndex.flatMap((t) =>
				t.r.filter((r) => r.startsWith('BCaBA:')).map((r) => r.charAt('BCaBA:'.length))
			)
		);
		expect([...letters].sort()).toEqual(BCaBA().domains.map((d) => d.letter));
	});
});

describe('every outline in the build', () => {
	it('names a credential exactly once, so a filter cannot be ambiguous', () => {
		const creds = Object.values(outlines).map((o) => o.credential);
		expect(new Set(creds).size).toBe(creds.length);
	});

	/**
	 * Glossary coverage, measured against what the exam actually weights.
	 *
	 * A raw term count per area says nothing: five per cent of a paper does not need the
	 * coverage fourteen per cent does. The ratio is what shows an area falling behind, and
	 * it is how the analyst supervision and intervention areas were found sitting at
	 * eleven per cent of the exam apiece with twenty terms between them.
	 *
	 * The floor is set at today's thinnest area rather than at some aspirational figure,
	 * because a ratchet exists to stop regression, not to fail on arrival. Today that
	 * area is technician Documentation and Reporting: thirteen per cent of that paper,
	 * thirteen terms, exactly one per point, and the least covered area in the app. Next
	 * come technician Behavior Assessment at 1.36 and analyst Ethical and Professional
	 * Issues at 1.38. Those three are where this number gets raised from.
	 */
	const MIN_TERMS_PER_WEIGHT_POINT = 1;

	it('covers every area in proportion to what the exam weights it', () => {
		const thin: string[] = [];
		for (const o of Object.values(outlines)) {
			const prefix = `${o.credential}:`;
			for (const d of o.domains) {
				if (d.examWeightPercent === null || d.examWeightPercent === 0) continue;
				const n = termIndex.filter((t) =>
					t.r.some((r) => r.startsWith(prefix) && r.charAt(prefix.length) === d.letter)
				).length;
				const ratio = n / d.examWeightPercent;
				if (ratio < MIN_TERMS_PER_WEIGHT_POINT) {
					thin.push(
						`${o.credential} ${d.letter} (${d.name}): ${n} terms for ${d.examWeightPercent}% — ${ratio.toFixed(2)} per point`
					);
				}
			}
		}
		expect(thin).toEqual([]);
	});
});
