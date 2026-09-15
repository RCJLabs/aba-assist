import { describe, expect, it } from 'vitest';
import type { TermIndexEntry } from '@aba/content-schema';
import { quickLookup } from './lookup.js';

const t = (i: string, name: string, a: string[] = []): TermIndexEntry => ({
	i,
	t: name,
	a,
	c: 'principles',
	g: `What ${name} means`,
	b: 1,
	r: [],
	f: true
});

const index = [
	t('motivating-operation', 'Motivating Operation', ['MO']),
	t('momentary-time-sampling', 'Momentary Time Sampling', ['MTS']),
	t('mand', 'Mand', ['request']),
	t('negative-reinforcement', 'Negative Reinforcement', ['SR-']),
	t('extinction', 'Extinction', ['EXT'])
];

describe('quickLookup', () => {
	it('says nothing until there is something to go on', () => {
		expect(quickLookup(index, '')).toEqual([]);
		expect(quickLookup(index, 'm')).toEqual([]);
	});

	it('ranks an exact name above a prefix above a word buried inside', () => {
		const names = quickLookup(index, 'mand').map((e) => e.t);
		expect(names[0]).toBe('Mand');
	});

	it('prefers what the half-typed word starts, since that is the normal input', () => {
		const names = quickLookup(index, 'mo').map((e) => e.t);
		expect(names[0]).toBe('Motivating Operation');
		expect(names).toContain('Momentary Time Sampling');
	});

	it('finds a term by an abbreviation somebody just heard', () => {
		expect(quickLookup(index, 'MTS').map((e) => e.i)).toEqual(['momentary-time-sampling']);
		expect(quickLookup(index, 'sr-').map((e) => e.i)).toEqual(['negative-reinforcement']);
	});

	it('matches inside a name too, for a half-remembered second word', () => {
		expect(quickLookup(index, 'reinforcement').map((e) => e.i)).toEqual([
			'negative-reinforcement'
		]);
	});

	it('keeps the list short enough to read at a glance', () => {
		expect(quickLookup(index, 'm', 2)).toEqual([]);
		expect(quickLookup(index, 'mo', 1)).toHaveLength(1);
	});
});
