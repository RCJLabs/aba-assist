import { describe, expect, it } from 'vitest';
import MiniSearch from 'minisearch';
import { searchOptions } from '@aba/content-schema/runtime';
import index from '$lib/content/generated/search-index.json' with { type: 'json' };
import { QUERY_SET, describeFailure, evaluate } from './quality.js';

/**
 * Search, measured against the index that actually ships.
 *
 * `MiniSearch.loadJSON` with the shared options is exactly what the browser does, so this
 * is the ranking a reader gets rather than a model of it. If the two ever diverge, the
 * divergence is the bug — the options are a single source of truth for that reason.
 */
const engine = MiniSearch.loadJSON(JSON.stringify(index), searchOptions() as never);
const search = (q: string): string[] =>
	engine.search(q).map((r) => String((r as { i?: unknown }).i ?? r.id));

const report = evaluate(QUERY_SET, search);

/**
 * The floors, set to what was measured the day the set was written: 45 of 48, and a mean
 * reciprocal rank of 0.839.
 *
 * Neither is a target and neither claims search is good. They are the numbers that stop it
 * getting worse. Raise them when a change earns it; never lower one to make a red suite
 * green, because that turns the only measure of retrieval this project has into a rubber
 * stamp.
 *
 * Both are needed, and that is a measured result rather than a belt-and-braces habit. The
 * pass count alone is a poor ratchet: deleting every field boost from the index
 * configuration — about as large a ranking regression as this app could suffer — moved it
 * by three queries, because most of the set is exact term names and those win on a title
 * match whatever the weighting does. Reciprocal rank moves continuously, so an answer
 * slipping from first to third registers even though it still passes.
 *
 * The sensitivity was checked by breaking the configuration three ways and watching both
 * numbers fall: no boosts 42/48 and 0.802, no fuzzy 39/48 and 0.751, no prefix matching
 * 42/48 and 0.805. The prefix figure is why three of the prefix queries stop several
 * letters short of the whole word — the shorter ones are close enough that the fuzzy
 * setting rescues them, so on their own they were testing fuzzy and reporting it as
 * prefix.
 *
 * The three that fail are in the set as a record of what search cannot do, not as
 * candidates for deletion. Two are the hard class — a situation described rather than
 * named. The third is the interesting one: "prompt fading" is answered instantly, and
 * "how do I fade prompts" buries it under six situations.
 */
const MINIMUM_PASSING = 45;

/** A hair under the measured 0.839, so ordinary content drift is not a failing suite. */
const MINIMUM_MRR = 0.83;

describe('search quality', () => {
	it('does not fall below the measured floor', () => {
		const detail = report.failures.map(describeFailure).join('\n  ');
		expect(
			report.passed,
			`${report.passed}/${report.total} queries found what they were looking for.\n  ${detail}`
		).toBeGreaterThanOrEqual(MINIMUM_PASSING);
	});

	it('does not let answers slide down the page', () => {
		// The measure that catches a change nothing fails on: everything still found, but
		// found later. `toBeGreaterThanOrEqual` on a rounded figure so the message is
		// readable when it does go red.
		expect(
			Number(report.mrr.toFixed(3)),
			`mean reciprocal rank ${report.mrr.toFixed(3)}, floor ${MINIMUM_MRR}`
		).toBeGreaterThanOrEqual(MINIMUM_MRR);
	});

	it('finds a term by its own name, every time', () => {
		/*
		 * The floor under the floor. Somebody who knows the word and wants the definition
		 * is the commonest search there is, and anything other than first place is a bug
		 * rather than a ranking preference.
		 */
		const named = QUERY_SET.filter((e) => e.within === 1);
		const out = evaluate(named, search);
		expect(out.failures.map(describeFailure)).toEqual([]);
	});

	it('never returns a result for a query that asks for nothing', () => {
		// A search that always answers is a search that cannot be trusted when it does.
		expect(search('qqzzxw')).toEqual([]);
	});

	it('keeps every expected id in the corpus it is measured against', () => {
		/*
		 * A query whose target has been renamed or withheld would fail for a reason that
		 * has nothing to do with ranking, and would be read as a ranking regression. This
		 * separates the two: a missing id is a broken expectation, not a worse search.
		 */
		const known = new Set(Object.values(index.storedFields ?? {}).map((d) => String(d.i)));
		const unknown = QUERY_SET.flatMap((e) =>
			(typeof e.expect === 'string' ? [e.expect] : e.expect).filter((id) => !known.has(id))
		);
		expect(unknown).toEqual([]);
	});
});
