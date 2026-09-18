import { describe, expect, it } from 'vitest';
import {
	MIN_INTENT_TOKENS,
	intentTokens,
	matchesIntent,
	routesFor,
	type IntentRoute
} from './intent.js';

const route = (phrase: string, id: string, escalate = true): IntentRoute => ({
	phrase,
	id,
	title: id,
	escalate
});

describe('normalising', () => {
	it('drops the words that decide nothing', () => {
		expect(intentTokens('he is hitting his own head')).toEqual(['hit', 'own', 'head']);
	});

	it('answers the same reader whichever pronoun they use', () => {
		/*
		 * The load-bearing part. One authored phrase has to cover "he", "she" and "they", or
		 * it answers a third of the people who need it and looks broken to the rest.
		 */
		const forms = [
			'he is hitting his own head',
			'she keeps hitting her own head',
			'they hit their own head'
		];
		const tokens = forms.map((f) => intentTokens(f).join(' '));
		expect(new Set(tokens).size).toBe(1);
	});

	it('joins the forms of a verb people actually type', () => {
		const stems = ['hitting', 'hits', 'hit'].map((w) => intentTokens(w)[0]);
		expect(new Set(stems).size).toBe(1);
	});

	it('splits a hyphenated word rather than keeping it whole', () => {
		expect(intentTokens('self-injury')).toEqual(['self', 'injury']);
	});

	it('leaves a short word alone rather than stemming it to nothing', () => {
		// "die" and "dying" are the words on the card that matters most; an over-eager
		// stemmer that turned either into "di" would quietly stop matching both.
		expect(intentTokens('wants to die')).toContain('die');
		expect(intentTokens('bus').join(' ')).toBe('bus');
	});
});

describe('matching', () => {
	it('matches when the query contains everything the phrase asks for', () => {
		expect(
			matchesIntent('he is hitting his own head really hard', 'hitting their own head')
		).toBe(true);
	});

	it('does not match when the query is missing one of the phrase words', () => {
		/*
		 * The asymmetry the whole design rests on. A miss costs nothing — the query falls
		 * through to the search that was already there — and a false match sends somebody
		 * mid-incident to the wrong card.
		 */
		expect(matchesIntent('he is hitting the wall', 'hitting their own head')).toBe(false);
	});

	it('does not let a longer phrase be claimed by a shorter query', () => {
		expect(matchesIntent('head', 'hitting their own head')).toBe(false);
	});

	it('ignores word order, because nobody types the sentence the card was written as', () => {
		expect(matchesIntent('their head, they keep hitting it', 'hitting their own head')).toBe(
			false
		);
		expect(matchesIntent('own head is what they keep hitting', 'hitting their own head')).toBe(
			true
		);
	});

	it('refuses a phrase too vague to route on', () => {
		// Belt and braces: the build rejects these, and the matcher will not honour one that
		// somehow reached a reader.
		expect(matchesIntent('he is hitting something', 'hitting')).toBe(false);
		expect(matchesIntent('anything at all', 'the')).toBe(false);
		expect(MIN_INTENT_TOKENS).toBe(2);
	});
});

describe('routing', () => {
	const routes = [
		route('hitting their own head', 'self-injury'),
		route('banging their head', 'self-injury'),
		route('running toward the road', 'elopement'),
		route('wants to die', 'suicidal'),
		route('hurt during an incident', 'injury-report')
	];

	it('returns nothing for a query that asks for nothing', () => {
		expect(routesFor('what is a motivating operation', routes)).toEqual([]);
	});

	it('returns one row per situation even when two of its phrases match', () => {
		const out = routesFor('they are hitting and banging their own head', routes);
		expect(out).toHaveLength(1);
		expect(out[0].id).toBe('self-injury');
		// And it keeps the more specific of the two phrases.
		expect(out[0].phrase).toBe('hitting their own head');
	});

	it('returns both when two situations genuinely apply', () => {
		/*
		 * Somebody hurt during an incident is also an incident. Picking one for the reader
		 * would be this app making a clinical judgement it has no standing to make.
		 */
		const out = routesFor('someone was hurt during an incident and wants to die', routes);
		expect(out.map((r) => r.id).sort()).toEqual(['injury-report', 'suicidal']);
	});

	it('puts the more specific claim first', () => {
		const mixed = [route('wants to die', 'a'), route('hurt during an incident', 'b')];
		const out = routesFor('hurt during an incident, and wants to die', mixed);
		expect(out[0].id).toBe('b');
	});

	it('orders the same way whatever order the routes arrive in', () => {
		const q = 'hurt during an incident, and wants to die';
		const a = routesFor(q, routes).map((r) => r.id);
		const b = routesFor(q, [...routes].reverse()).map((r) => r.id);
		expect(a).toEqual(b);
	});
});
