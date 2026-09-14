import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile } from './compile.js';
import type { Channel } from '@aba/content-schema';

/**
 * Integration tests for the build gate.
 *
 * The unit tests in content-schema prove the Zod guards reject bad objects. These prove
 * the same thing end-to-end through real files on disk, which is what actually runs in
 * CI — a guard that works on a literal but not on a parsed frontmatter block would be
 * worthless.
 */

const SOURCES = `
sources:
  - id: open-source-doc
    kind: organization-publication
    title: A public domain government document
    rights: public-domain
    quotationAllowed: true
  - id: closed-book
    kind: book
    title: A copyrighted textbook
    rights: all-rights-reserved
    quotationAllowed: false
`;

function frontmatter(obj: Record<string, unknown>, body = 'Body text.'): string {
	const yaml = JSON.stringify(obj, null, 2);
	// JSON is valid YAML, which keeps these fixtures readable and unambiguous.
	return `---\n${yaml}\n---\n\n${body}\n`;
}

const attestation = {
	originalProse: true,
	noVerbatimSource: true,
	consulted: 'Primary sources only, written from scratch.'
};
const review = { status: 'in-review', authoredBy: 'tester', authoredOn: '2026-09-14' };
const provenance = { license: 'CC-BY-SA-4.0', updated: '2026-09-14' };

function term(overrides: Record<string, unknown> = {}) {
	return {
		id: 'sample-term',
		term: 'Sample Term',
		category: 'principles',
		definition: {
			technical:
				'A precise statement of the concept that is long enough to satisfy the minimum length requirement imposed by the schema.',
			plain: 'A short and easy way to say the same thing so that a new reader can follow it.',
			gloss: 'A short summary line'
		},
		examples: [{ text: 'An example that is comfortably longer than the minimum.' }],
		nonExamples: [{ text: 'A non-example that is comfortably longer than the minimum.' }],
		citations: [{ sourceId: 'open-source-doc', useType: 'fact-reference' }],
		attestation,
		review,
		provenance,
		...overrides
	};
}

async function build(
	files: Record<string, string>,
	channel: Channel = 'pr'
): Promise<Awaited<ReturnType<typeof compile>>> {
	const root = await mkdtemp(join(tmpdir(), 'aba-content-'));
	await mkdir(join(root, '_registry'), { recursive: true });
	await writeFile(join(root, '_registry', 'sources.yaml'), SOURCES);
	for (const [rel, content] of Object.entries(files)) {
		const path = join(root, rel);
		await mkdir(join(path, '..'), { recursive: true });
		await writeFile(path, content);
	}
	return compile({ root, channel, outDir: join(root, '.out') });
}

const rules = (r: Awaited<ReturnType<typeof compile>>) => r.errors.map((e) => e.rule);

describe('the build gate', () => {
	it('accepts a well-formed term', async () => {
		const r = await build({ 'terms/principles/sample-term.md': frontmatter(term()) });
		expect(r.errors).toEqual([]);
		expect(r.ok).toBe(true);
		expect(r.counts.terms).toBe(1);
	});

	it('emits a content version and assets only when valid', async () => {
		const r = await build({ 'terms/principles/sample-term.md': frontmatter(term()) });
		expect(r.contentVersion).toMatch(/^[0-9a-f]{12}$/);
		expect(r.assets.map((a) => a.name)).toContain('terms.index');
		expect(r.assets.map((a) => a.name)).toContain('search-index');
	});
});

describe('copyright guard, end to end', () => {
	it('REJECTS officialText written into a real file', async () => {
		const r = await build({
			'terms/principles/sample-term.md': frontmatter(
				term({ officialText: 'Verbatim text lifted from a task list.' })
			)
		});
		expect(r.ok).toBe(false);
		expect(rules(r).some((x) => x.startsWith('schema/'))).toBe(true);
	});

	it('REJECTS a quotation from a source that does not permit quotation', async () => {
		const r = await build({
			'terms/principles/sample-term.md': frontmatter(
				term({
					citations: [
						{
							sourceId: 'closed-book',
							useType: 'quotation',
							quotedText: 'a short quoted phrase'
						}
					]
				})
			)
		});
		expect(rules(r)).toContain('rights/quotation-not-permitted');
	});

	it('REJECTS an over-long quotation even from a permitted source', async () => {
		const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
		const r = await build({
			'terms/principles/sample-term.md': frontmatter(
				term({
					citations: [{ sourceId: 'open-source-doc', useType: 'quotation', quotedText: long }]
				})
			)
		});
		expect(rules(r)).toContain('rights/quotation-too-long');
	});

	it('REJECTS a long quoted run pasted into body prose', async () => {
		const r = await build({
			'terms/principles/sample-term.md': frontmatter(
				term({
					definition: {
						technical:
							'The concept is described as "a lengthy sentence copied verbatim from somewhere else entirely, running well past the length that any fair summary would need to run".',
						plain: 'A short and easy way to say the same thing so a new reader can follow it.',
						gloss: 'A short summary line'
					}
				})
			)
		});
		expect(rules(r)).toContain('rights/inline-quote');
	});
});

describe('safety guard, end to end', () => {
	const scenarioBase = {
		id: 'a-scenario',
		title: 'A situation that arises during a session',
		situation:
			'A described situation that is long enough to satisfy the schema minimum length for this field.',
		setting: 'clinic',
		audience: ['RBT'],
		citations: [{ sourceId: 'open-source-doc', useType: 'fact-reference' }],
		attestation,
		review,
		provenance
	};

	it('REJECTS risk language hiding in a guidance scenario', async () => {
		const r = await build({
			'scenarios/a-scenario.md': frontmatter({
				...scenarioBase,
				kind: 'guidance',
				steps: [
					{ text: 'Do the first ordinary thing that the plan says.' },
					{ text: 'If the learner begins to self-injure, respond to that.' }
				],
				whatNotToDo: ['Do not improvise a new consequence.'],
				whenToEscalate: ['Tell your supervisor the same day.']
			})
		});
		expect(rules(r)).toContain('safety/risk-language-in-guidance');
	});

	it('REJECTS a physical procedure described inside an escalation card', async () => {
		const r = await build({
			'scenarios/a-scenario.md': frontmatter({
				...scenarioBase,
				kind: 'escalation-only',
				riskFlags: ['self-injury'],
				escalation: {
					stopAndEscalate: true,
					contacts: ['supervising-bcba', 'emergency-services-911'],
					immediateSafetyNote:
						'Restrain the learner until the behavior stops and then call for assistance.',
					documentation: ['Write down what happened.'],
					legalNote: 'State law and your employer policy govern this situation entirely.',
					consultYourPolicy: true
				}
			})
		});
		expect(rules(r)).toContain('safety/procedure-in-escalation');
	});

	it('REJECTS a suspected-abuse card with no mandated-reporter note', async () => {
		const r = await build({
			'scenarios/a-scenario.md': frontmatter({
				...scenarioBase,
				kind: 'escalation-only',
				riskFlags: ['suspected-abuse'],
				escalation: {
					stopAndEscalate: true,
					contacts: ['supervising-bcba', 'child-protective-services'],
					immediateSafetyNote: 'Make sure the person is safe and is not left on their own.',
					documentation: ['Write down exactly what was said.'],
					legalNote:
						'Mandated reporting duties are set by state law rather than by an employer.',
					consultYourPolicy: true
				}
			})
		});
		expect(rules(r)).toContain('safety/missing-mandated-reporter-note');
	});

	it('REJECTS a medical-emergency card that does not route to emergency services', async () => {
		const r = await build({
			'scenarios/a-scenario.md': frontmatter({
				...scenarioBase,
				kind: 'escalation-only',
				riskFlags: ['medical-emergency'],
				escalation: {
					stopAndEscalate: true,
					contacts: ['supervising-bcba'],
					immediateSafetyNote:
						'Make sure the person is safe and summon assistance right away.',
					documentation: ['Write down what happened and when.'],
					legalNote: 'Your employer protocol and state law govern what staff may do here.',
					consultYourPolicy: true
				}
			})
		});
		expect(rules(r)).toContain('safety/missing-required-contact');
	});
});

describe('referential integrity and review gate', () => {
	it('REJECTS an unresolved cross-reference', async () => {
		const r = await build({
			'terms/principles/sample-term.md': frontmatter(term({ seeAlso: ['does-not-exist'] }))
		});
		expect(rules(r)).toContain('refs/unresolved');
	});

	it('REJECTS a citation to an unknown source', async () => {
		const r = await build({
			'terms/principles/sample-term.md': frontmatter(
				term({ citations: [{ sourceId: 'no-such-source', useType: 'fact-reference' }] })
			)
		});
		expect(rules(r)).toContain('refs/unknown-source');
	});

	it('REJECTS a one-way contrastWith', async () => {
		const r = await build({
			'terms/principles/sample-term.md': frontmatter(term({ contrastWith: ['other-term'] })),
			'terms/principles/other-term.md': frontmatter(
				term({ id: 'other-term', term: 'Other Term' })
			)
		});
		expect(rules(r)).toContain('refs/asymmetric-contrast');
	});

	it('REJECTS a file whose id does not match its filename', async () => {
		const r = await build({ 'terms/principles/wrong-name.md': frontmatter(term()) });
		expect(rules(r)).toContain('structure/id-filename-mismatch');
	});

	it('REJECTS a term filed under the wrong category directory', async () => {
		const r = await build({ 'terms/measurement/sample-term.md': frontmatter(term()) });
		expect(rules(r)).toContain('structure/category-directory-mismatch');
	});

	it('REJECTS a draft in the pr channel but allows it in dev', async () => {
		const draft = {
			'terms/principles/sample-term.md': frontmatter(
				term({ review: { ...review, status: 'draft' } })
			)
		};
		expect(rules(await build(draft, 'pr'))).toContain('review/status-not-shippable');
		expect((await build(draft, 'dev')).ok).toBe(true);
	});

	it('REJECTS in-review content in the release channel', async () => {
		const r = await build(
			{ 'terms/principles/sample-term.md': frontmatter(term()) },
			'release'
		);
		expect(rules(r)).toContain('review/status-not-shippable');
	});

	it('REJECTS an item approved by its own author', async () => {
		const r = await build(
			{
				'terms/principles/sample-term.md': frontmatter(
					term({
						review: {
							status: 'approved',
							authoredBy: 'tester',
							authoredOn: '2026-09-14',
							reviewedBy: 'tester',
							reviewedOn: '2026-09-14'
						}
					})
				)
			},
			'release'
		);
		expect(rules(r)).toContain('review/self-review');
	});
});

describe('editorial gate', () => {
	it('REJECTS a plain-language field that is not actually plain', async () => {
		const r = await build({
			'terms/principles/sample-term.md': frontmatter(
				term({
					definition: {
						technical:
							'A precise statement of the concept that is long enough to satisfy the minimum length requirement.',
						plain:
							'Contingent manipulation of establishing operations differentially potentiates the reinforcing efficacy of putatively preferred stimuli, consequently modulating response allocation across concurrently available alternatives.',
						gloss: 'A short summary line'
					}
				})
			)
		});
		expect(rules(r)).toContain('editorial/plain-language-too-hard');
	});
});
