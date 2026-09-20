import { describe, expect, it } from 'vitest';
import { absoluteUrl, clamp, definedTerm, definedTermSet, webSite } from './meta.js';

const PROJECT = { origin: 'https://rcjlabs.github.io', base: '/aba-assist' };
const DOMAIN = { origin: 'https://aba.rcjlabs.com', base: '' };

describe('building an absolute URL', () => {
	it('carries the base path on a project site', () => {
		expect(absoluteUrl(PROJECT.origin, PROJECT.base, '/glossary/tact')).toBe(
			'https://rcjlabs.github.io/aba-assist/glossary/tact'
		);
	});

	it('adds nothing on a custom domain', () => {
		expect(absoluteUrl(DOMAIN.origin, DOMAIN.base, '/glossary/tact')).toBe(
			'https://aba.rcjlabs.com/glossary/tact'
		);
	});

	it('never produces a double slash', () => {
		// The origin may or may not have been written with a trailing slash, and a
		// canonical link with `//` in it points at a different URL than the one served.
		expect(absoluteUrl('https://example.com/', '/aba-assist/', '/glossary')).toBe(
			'https://example.com/aba-assist/glossary'
		);
	});

	it('keeps the home page on a trailing slash and nothing else', () => {
		/*
		 * `…/aba-assist` and `…/aba-assist/` are one page and Pages serves the second, so
		 * the canonical link has to name that one. Deeper routes are served without.
		 */
		expect(absoluteUrl(PROJECT.origin, PROJECT.base, '/')).toBe(
			'https://rcjlabs.github.io/aba-assist/'
		);
		expect(absoluteUrl(DOMAIN.origin, DOMAIN.base, '/')).toBe('https://aba.rcjlabs.com/');
		expect(absoluteUrl(DOMAIN.origin, DOMAIN.base, '/help')).toBe(
			'https://aba.rcjlabs.com/help'
		);
	});

	it('tolerates a route given without its leading slash', () => {
		expect(absoluteUrl(DOMAIN.origin, DOMAIN.base, 'help')).toBe(
			'https://aba.rcjlabs.com/help'
		);
	});
});

describe('clamping a description', () => {
	it('leaves a short one alone', () => {
		expect(clamp('A motivating operation alters the value of a consequence.')).toBe(
			'A motivating operation alters the value of a consequence.'
		);
	});

	it('flattens the whitespace a Markdown paragraph arrives with', () => {
		expect(clamp('one\n  two\tthree')).toBe('one two three');
	});

	it('cuts on a word rather than mid-word', () => {
		const out = clamp('alpha bravo charlie delta echo foxtrot', 20);
		expect(out).toBe('alpha bravo charlie…');
		expect(out.length).toBeLessThanOrEqual(20);
	});

	it('does not leave punctuation stranded before the ellipsis', () => {
		expect(clamp('alpha bravo, charlie delta', 15)).toBe('alpha bravo…');
	});

	it('still cuts a single word longer than the limit', () => {
		// No space to break on. Better a hard cut than a description over the limit.
		const out = clamp('a'.repeat(50), 10);
		expect(out).toHaveLength(10);
		expect(out.endsWith('…')).toBe(true);
	});
});

describe('a glossary entry as structured data', () => {
	const term = () =>
		definedTerm({
			...PROJECT,
			id: 'motivating-operation',
			term: 'Motivating Operation',
			description: 'Alters how much a consequence is worth right now.',
			aliases: ['MO', 'establishing operation']
		});

	it('names itself, its set and the page it is on', () => {
		const t = term();
		expect(t['@type']).toBe('DefinedTerm');
		expect(t.name).toBe('Motivating Operation');
		expect(t.termCode).toBe('motivating-operation');
		expect(t.url).toBe('https://rcjlabs.github.io/aba-assist/glossary/motivating-operation');
		expect((t.inDefinedTermSet as Record<string, string>).url).toBe(
			'https://rcjlabs.github.io/aba-assist/glossary'
		);
	});

	it('carries the aliases, which are how people actually search', () => {
		expect(term().alternateName).toEqual(['MO', 'establishing operation']);
	});

	it('leaves alternateName out entirely rather than empty', () => {
		const t = definedTerm({ ...PROJECT, id: 'x', term: 'X', description: 'd', aliases: [] });
		expect('alternateName' in t).toBe(false);
	});

	it('claims nothing the page does not say', () => {
		/*
		 * The failure mode for structured data is overstatement, and it is punished by
		 * having rich results withdrawn. These entries are unsigned until a human reviewer
		 * approves them, and the content files carry no editorial date.
		 */
		const t = term();
		for (const key of ['author', 'datePublished', 'aggregateRating', 'review', 'creator']) {
			expect(t).not.toHaveProperty(key);
		}
	});
});

describe('the set and the site', () => {
	it('states its size without listing every entry', () => {
		// 259 terms of JSON on a page whose own HTML is smaller would be a machine-readable
		// duplicate of the list already rendered below it.
		const set = definedTermSet({ ...PROJECT, description: 'Every term.', count: 259 });
		expect(set.numberOfItems).toBe(259);
		expect('hasDefinedTerm' in set).toBe(false);
	});

	it('offers no search action, because there is no URL to search at', () => {
		// Search runs in the browser against a downloaded index. A sitelinks search box
		// would point at a query URL this app does not serve.
		const site = webSite({ ...PROJECT, description: 'A free reference.' });
		expect('potentialAction' in site).toBe(false);
		expect(site.url).toBe('https://rcjlabs.github.io/aba-assist/');
	});
});
