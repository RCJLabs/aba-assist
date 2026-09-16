import { describe, expect, it } from 'vitest';
import { batchFor, drawSample, tierFor, type ReviewTier } from './tier.js';
import type { ReviewItem } from './reviewable.js';

function item(over: Partial<ReviewItem> = {}): ReviewItem {
	return {
		id: 'x',
		kind: 'term',
		title: 'A term',
		subtitle: 'principles',
		status: 'in-review',
		category: 'principles',
		gate: null,
		href: null,
		fields: [{ label: 'Technical definition', lines: ['An ordinary definition of a thing.'] }],
		citations: [],
		consulted: '',
		inboundRefs: 0,
		...over
	};
}

const tier = (i: ReviewItem): ReviewTier => tierFor(i).tier;

describe('what has to be read closely', () => {
	it('puts everything somebody acts on or is held to in the top tier', () => {
		expect(tier(item({ kind: 'scenario' }))).toBe('A');
		expect(tier(item({ kind: 'ethics-topic' }))).toBe('A');
		expect(tier(item({ kind: 'ethics-code' }))).toBe('A');
		expect(tier(item({ kind: 'credential' }))).toBe('A');
		expect(tier(item({ kind: 'practice-guide' }))).toBe('A');
	});

	it('puts questions and graphs in the read-every-one-first-pass tier', () => {
		expect(tier(item({ kind: 'question' }))).toBe('B');
		expect(tier(item({ kind: 'graph' }))).toBe('B');
	});

	it('leaves an ordinary definition sampleable', () => {
		expect(tier(item())).toBe('C');
		expect(batchFor(item())).toBe('term:principles');
	});

	it('promotes an ethics or supervision definition, because it is also an obligation', () => {
		expect(tier(item({ category: 'ethics' }))).toBe('A');
		expect(tier(item({ category: 'supervision' }))).toBe('A');
		expect(batchFor(item({ category: 'ethics' }))).toBeNull();
	});

	it('promotes any definition whose prose touches risk, without anybody tagging it', () => {
		// This is the property that has to hold as the glossary grows: nothing about
		// "time-out" or "response blocking" says high-stakes in its metadata.
		const risky = item({
			id: 'response-blocking',
			category: 'reduction',
			fields: [
				{
					label: 'Technical definition',
					lines: ['A procedure used where self-injury would otherwise contact reinforcement.']
				}
			]
		});
		expect(tier(risky)).toBe('A');
		expect(tierFor(risky).reason).toMatch(/self-injur/i);
		expect(batchFor(risky)).toBeNull();
	});

	// The fixture above invents risk wording. The real entry has none, which is the case
	// this covers: an entry about hands on a learner, with no crisis word anywhere in it.
	it('promotes a definition about physical contact, with no risk word in it', () => {
		const contact = item({
			id: 'response-blocking',
			category: 'reduction',
			fields: [
				{
					label: 'Technical definition',
					lines: [
						'A procedure in which the interventionist physically interrupts a response as it begins.'
					]
				}
			]
		});
		expect(tier(contact)).toBe('A');
		expect(batchFor(contact)).toBeNull();

		const prompting = item({
			id: 'prompt',
			category: 'acquisition',
			fields: [{ label: 'Technical definition', lines: ['Physical guidance through a step.'] }]
		});
		expect(tier(prompting)).toBe('A');
	});

	// The broad lexicon matches "block" so that escalation prose cannot say it. Tiering
	// uses the narrow one, or every interval-recording entry would land in the top tier.
	it('leaves ten-second blocks and holding a container in the sampled tier', () => {
		const intervals = item({
			category: 'measurement',
			fields: [
				{
					label: 'Technical definition',
					lines: ['The session is divided into ten-second blocks and each is scored.']
				}
			]
		});
		expect(tier(intervals)).toBe('C');

		const mand = item({
			category: 'verbal-behavior',
			fields: [
				{
					label: 'Example',
					lines: ['A learner signs "open" while holding a closed container.']
				}
			]
		});
		expect(tier(mand)).toBe('C');
	});

	it('promotes a definition that strays into clinical decision language', () => {
		const clinical = item({
			fields: [{ label: 'Technical definition', lines: ['Used where a diagnosis of autism…'] }]
		});
		expect(tier(clinical)).toBe('A');
	});
});

describe('drawing a sample', () => {
	const ids = Array.from({ length: 40 }, (_, i) => `t${String(i).padStart(2, '0')}`);

	it('draws the same items every time for the same build', () => {
		const a = drawSample('term:principles', ids, 0.25, 'abc123');
		const b = drawSample('term:principles', [...ids].reverse(), 0.25, 'abc123');
		// Order in is irrelevant: the draw is over the sorted ids, so a loader that
		// returns them differently does not silently change what was reviewed.
		expect(a.drawn).toEqual(b.drawn);
	});

	it('draws differently once the content has changed', () => {
		const a = drawSample('term:principles', ids, 0.25, 'abc123');
		const b = drawSample('term:principles', ids, 0.25, 'def456');
		expect(a.drawn).not.toEqual(b.drawn);
	});

	it('covers the batch exactly once between drawn and carried', () => {
		const s = drawSample('term:principles', ids, 0.25, 'abc123');
		expect(s.drawn).toHaveLength(10);
		expect([...s.drawn, ...s.carried].sort()).toEqual([...ids].sort());
		expect(new Set([...s.drawn, ...s.carried]).size).toBe(ids.length);
	});

	it('draws everything at a rate of one, so sampling can be switched off', () => {
		const s = drawSample('term:principles', ids, 1, 'abc123');
		expect(s.carried).toEqual([]);
		expect(s.drawn).toHaveLength(ids.length);
	});

	it('always draws at least one, however small the rate', () => {
		expect(drawSample('b', ids, 0.001, 'v').drawn).toHaveLength(1);
	});

	it('labels the draw so a carried file can say what carried it', () => {
		expect(drawSample('term:principles', ids, 0.25, 'abc123').label).toBe(
			'term:principles@abc123:10-of-40'
		);
	});
});
