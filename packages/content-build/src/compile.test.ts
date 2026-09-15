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

describe('outline references', () => {
	const outline = `
id: rbt-tco-3
credential: RBT
edition: '3rd'
effectiveDate: '2026-01-01'
issuer: BACB
sourceId: open-source-doc
countsVerified: false
totalTasks: 43
exam: { scoredItems: 75, unscoredItems: 10, minutes: 90 }
domains:
  - letter: C
    name: Behavior Acquisition
    examWeightPercent: 100
    examItems: 75
    ourDescription: Teaching new skills, prompting and fading, and running programs as written every time.
    tasks:
      - code: C.1
        ourSummary: Run a teaching program the way it is written, including its prompting procedure.
        plainSummary: Run the program as written.
        attestation:
          originalProse: true
          noVerbatimSource: true
          consulted: Task topic from the outline; summary written independently.
review: { status: in-review, authoredBy: tester, authoredOn: '2026-09-14' }
provenance: { license: CC-BY-SA-4.0, updated: '2026-09-14' }
`;

	it('accepts a domain-level ref and a verified task-level ref', async () => {
		const r = await build({
			'taxonomy/rbt-tco-3.yaml': outline,
			'terms/principles/sample-term.md': frontmatter(
				term({
					taskRefs: [
						{ credential: 'RBT', code: 'C' },
						{ credential: 'RBT', code: 'C.1' }
					]
				})
			)
		});
		expect(r.errors).toEqual([]);
		const index = JSON.parse(r.assets.find((a) => a.name === 'terms.index')!.source) as {
			r: string[];
		}[];
		expect(index[0]!.r).toEqual(['RBT:C', 'RBT:C.1']);
	});

	it('REJECTS a task code that is not in the outline, and a domain that does not exist', async () => {
		const r = await build({
			'taxonomy/rbt-tco-3.yaml': outline,
			'terms/principles/sample-term.md': frontmatter(
				term({
					taskRefs: [
						{ credential: 'RBT', code: 'C.9' },
						{ credential: 'RBT', code: 'D' }
					]
				})
			)
		});
		expect(rules(r).filter((x) => x === 'refs/unknown-task-code')).toHaveLength(2);
	});

	it('REJECTS a ref to a credential with no modelled outline', async () => {
		const r = await build({
			'taxonomy/rbt-tco-3.yaml': outline,
			'terms/principles/sample-term.md': frontmatter(
				term({ taskRefs: [{ credential: 'BCBA', code: 'A.1' }] })
			)
		});
		expect(rules(r)).toContain('refs/unknown-task-code');
	});

	it('REJECTS per-domain item counts that do not add up to the scored total', async () => {
		const r = await build({
			'taxonomy/rbt-tco-3.yaml': outline.replace('examItems: 75', 'examItems: 60')
		});
		expect(rules(r).some((x) => x.startsWith('schema/taxonomy'))).toBe(true);
	});
});

describe('questions', () => {
	const outline = `
id: rbt-tco-3
credential: RBT
edition: '3rd'
effectiveDate: '2026-01-01'
issuer: BACB
sourceId: open-source-doc
exam: { scoredItems: null, unscoredItems: null, minutes: null }
totalTasks: null
domains:
  - letter: A
    name: Data Collection and Graphing
    examWeightPercent: null
    ourDescription: Recording what happened during a session and putting it on a graph so change is visible.
review: { status: in-review, authoredBy: tester, authoredOn: '2026-09-14' }
provenance: { license: CC-BY-SA-4.0, updated: '2026-09-14' }
`;

	function question(overrides: Record<string, unknown> = {}) {
		return {
			id: 'q-1',
			credential: 'RBT',
			taskRef: { credential: 'RBT', code: 'A' },
			type: 'single-best-answer',
			stem: 'A technician counts 12 responses in 30 minutes. What is the rate per hour?',
			options: [
				{
					id: 'a',
					text: '24 per hour',
					isCorrect: true,
					rationale: 'Twelve in half an hour is 24 in an hour.'
				},
				{
					id: 'b',
					text: '12 per hour',
					isCorrect: false,
					rationale: 'That is the count, not the rate per hour.'
				},
				{
					id: 'c',
					text: '6 per hour',
					isCorrect: false,
					rationale: 'That scales in the wrong direction.'
				}
			],
			explanation:
				'Rate is count divided by time, scaled to the unit asked for. Twelve in 30 minutes is 24 per hour.',
			cognitiveLevel: 'application',
			difficulty: 2,
			termRefs: ['sample-term'],
			citations: [{ sourceId: 'open-source-doc', useType: 'fact-reference' }],
			attestation,
			review,
			provenance,
			...overrides
		};
	}

	const files = (q: Record<string, unknown>) => ({
		'taxonomy/rbt-tco-3.yaml': outline,
		'terms/principles/sample-term.md': frontmatter(term()),
		'questions/rbt/a.yaml': JSON.stringify({ questions: [q] })
	});

	it('loads a well-formed question, counts it, and emits a per-exam bucket', async () => {
		const r = await build(files(question()));
		expect(r.errors).toEqual([]);
		expect(r.counts.questions).toBe(1);
		// The term, the question and the taxonomy outline. Outlines count too: an unreviewed
		// exam blueprint is exactly the sort of thing nobody should find in a search engine.
		expect(r.counts.unreviewed).toBe(3);
		expect(r.assets.map((a) => a.name)).toContain('questions.RBT');
	});

	it('REJECTS a question filed under one exam but referencing another', async () => {
		const r = await build(files(question({ taskRef: { credential: 'BCBA', code: 'A.1' } })));
		expect(rules(r).some((x) => x.startsWith('schema/question'))).toBe(true);
	});

	it('REJECTS a stem that contradicts its negated flag', async () => {
		const r = await build(
			files(
				question({ stem: 'Which of the following is NOT a measure of rate?', negated: false })
			)
		);
		expect(rules(r).some((x) => x.startsWith('schema/question'))).toBe(true);
	});

	it('REJECTS an unresolved term reference from a question', async () => {
		const r = await build(files(question({ termRefs: ['no-such-term'] })));
		expect(rules(r)).toContain('refs/unresolved');
	});

	it('REJECTS clinical-decision language in a question', async () => {
		const r = await build(
			files(
				question({
					explanation:
						'The technician should suggest the family ask about a higher dosage of the medication before changing the plan.'
				})
			)
		);
		expect(rules(r)).toContain('safety/clinical-decision-language');
	});
});

describe('credential facts', () => {
	const facts = (extra = '') => `
id: rbt
credential: RBT
label: Registered Behavior Technician
issuer: BACB
handbookSourceId: open-source-doc
handbookVersion: '06/2026'
officialUrl: https://example.org/handbook
ourOverview: A paraprofessional certification maintained through supervision and, from 2027, professional development.
sections:
  - id: exam
    title: The examination
    items:
      - { label: Questions, value: '85 in total, 75 of them scored.' }
review: { status: in-review, authoredBy: tester, authoredOn: '2026-09-14' }
provenance: { license: CC-BY-SA-4.0, updated: '2026-09-14' }
${extra}`;

	it('loads credential facts and emits them', async () => {
		const r = await build({ 'credentials/rbt.yaml': facts() });
		expect(r.errors).toEqual([]);
		expect(r.counts.credentials).toBe(1);
		expect(r.assets.map((a) => a.name)).toContain('credentials');
	});

	it('REJECTS credential facts that try to carry the handbook text', async () => {
		const r = await build({
			'credentials/rbt.yaml': facts('officialText: Some text lifted from the handbook.')
		});
		expect(rules(r).some((x) => x.startsWith('schema/credential'))).toBe(true);
	});

	it('REJECTS credential facts with no official link', async () => {
		const r = await build({
			'credentials/rbt.yaml': facts().replace('officialUrl: https://example.org/handbook', '')
		});
		expect(rules(r).some((x) => x.startsWith('schema/credential'))).toBe(true);
	});
});

describe('practice guides', () => {
	const base = {
		title: 'What a session note has to carry',
		gloss: 'The elements most notes need, and why each one is there',
		audience: ['RBT'],
		ourSummary:
			'A session note is a clinical record and a billing record at once, which is why a thin one causes trouble twice over and leaves the next person without any context.',
		plainSummary:
			'A note is a health record and a bill. Write it right after the session, and cover the same points each time.',
		whoDecides:
			'Your employer and your funder set the real requirements, and they differ. Use your organisation template and ask your supervisor.',
		citations: [{ sourceId: 'open-source-doc', useType: 'fact-reference' }],
		attestation,
		review,
		provenance
	};

	const checklist = (over: Record<string, unknown> = {}) => ({
		...base,
		id: 'session-note-elements',
		kind: 'checklist',
		items: [
			{
				id: 'identifiers',
				label: 'Who, when and where, by code',
				why: 'The times are what a funder checks against the claim, and a mismatch is the commonest audit finding.'
			},
			{
				id: 'data',
				label: 'What the data showed',
				why: 'A number without a measure is not data. Say what was counted and over what period.'
			},
			{
				id: 'next',
				label: 'What you handed to the next session',
				why: 'One line on what the next person should watch for. It is the part colleagues actually read.'
			}
		],
		...over
	});

	const phrasing = (over: Record<string, unknown> = {}) => ({
		...base,
		id: 'subjective-to-objective',
		kind: 'phrasing',
		title: 'Saying it so somebody else could have counted it',
		pairs: [1, 2, 3, 4].map((n) => ({
			id: `pair-${n}`,
			vague: `A vague sentence number ${n}`,
			objective: `The same observation stated as a count and a duration, number ${n}.`,
			why: `Why the second version is the one a supervisor can use, number ${n}.`
		})),
		...over
	});

	it('loads a checklist and a phrasing guide, counts them, and emits the asset', async () => {
		const r = await build({
			'practice/session-note-elements.md': frontmatter(checklist()),
			'practice/subjective-to-objective.md': frontmatter(phrasing())
		});
		expect(r.errors).toEqual([]);
		expect(r.counts.practiceGuides).toBe(2);
		expect(r.assets.map((a) => a.name)).toContain('practice-guides');
	});

	it('REJECTS a checklist carrying phrasing pairs', async () => {
		// The discriminant decides which fields exist at all, so this is a parse error
		// rather than a field somebody has to remember to leave empty.
		const r = await build({
			'practice/session-note-elements.md': frontmatter(
				checklist({ pairs: [{ id: 'x', vague: 'a', objective: 'b', why: 'c' }] })
			)
		});
		expect(rules(r).some((x) => x.startsWith('schema/practice-guide'))).toBe(true);
	});

	it('REJECTS a guide that does not say who actually decides', async () => {
		const { whoDecides, ...withoutIt } = checklist();
		void whoDecides;
		const r = await build({ 'practice/session-note-elements.md': frontmatter(withoutIt) });
		expect(rules(r).some((x) => x.startsWith('schema/practice-guide'))).toBe(true);
	});

	it("REJECTS a guide that strays into a clinician's role", async () => {
		// The one safety check that applies to documentation guidance. The risk lexicon
		// that guards scenarios deliberately does not: describing a hard incident
		// accurately is the whole job here.
		const r = await build({
			'practice/session-note-elements.md': frontmatter(
				checklist({
					whoDecides:
						'Where a behaviour looks medication-related, note the dosage and say whether it should be titrated before the next session.'
				})
			)
		});
		expect(rules(r)).toContain('safety/clinical-decision-language');
	});

	it('ACCEPTS a guide describing an incident, which scenarios would have flagged', async () => {
		// Proof the filter is doing something: this prose trips the scenario risk lexicon,
		// and here it is exactly what a technician is required to write down.
		const r = await build({
			'practice/subjective-to-objective.md': frontmatter(
				phrasing({
					pairs: [
						{
							id: 'aggressive',
							vague: 'Was aggressive towards staff.',
							objective:
								'Hit the table with an open hand 3 times and pushed a chair over. No contact with staff, and nobody was injured.',
							why: 'Aggressive covers everything from a raised voice to an injury, so name what happened.'
						},
						{
							id: 'self-injury',
							vague: 'Had a bad episode of self-injury.',
							objective:
								'Hit the side of his head with an open hand 6 times over about 40 seconds. No marks, and the incident report was filed the same day.',
							why: 'An incident review will ask for a count, a duration and whether there was an injury.'
						},
						{
							id: 'tantrum',
							vague: 'Had a tantrum for ages.',
							objective:
								'Cried and lay on the floor for about 6 minutes, timed from the instruction.',
							why: 'For ages is not a duration, and tantrum is a label for a set of behaviours.'
						},
						{
							id: 'refused',
							vague: 'Refused to comply.',
							objective:
								'Did not begin the task within 10 seconds on 8 of 12 trials, and began after one repeat on 5 of those.',
							why: 'Refused hides both the measure and the response to prompting.'
						}
					]
				})
			)
		});
		expect(r.errors).toEqual([]);
	});

	it('REJECTS a guide whose plain summary is not actually plain', async () => {
		const r = await build({
			'practice/session-note-elements.md': frontmatter(
				checklist({
					plainSummary:
						'Documentation contemporaneity constitutes an indispensable methodological prerequisite insofar as retrospective reconstruction demonstrably attenuates descriptive veridicality.'
				})
			)
		});
		expect(rules(r)).toContain('editorial/plain-language-too-hard');
	});

	it('REJECTS a guide whose id does not match its filename', async () => {
		const r = await build({ 'practice/notes.md': frontmatter(checklist()) });
		expect(rules(r)).toContain('structure/id-filename-mismatch');
	});
});

describe('ethics reference', () => {
	const code = (extra = '') => `
id: rbt-ethics-code-2-0
issuer: BACB
shortName: RBT Ethics Code (2.0)
effectiveDate: '2022-01-01'
appliesTo: [RBT]
sourceId: open-source-doc
officialUrl: https://example.org/codes
totalStandards: 29
standardsVerified: false
ourOverview: The conduct rules every behaviour technician agrees to when they certify, and applicants before them.
corePrinciples:
  - number: 1
    ourLabel: Do good, and avoid doing harm
    ourSummary: Everything you do with a learner should leave them better off, and you weigh possible harm first.
    sourceNote: Named in the test content outline at task F.1.
sections:
  - number: '1'
    ourLabel: How you conduct yourself
    ourSummary: Your general conduct as a certificant, including staying inside your role and your training.
  - number: '2'
    ourLabel: How you deliver services
    ourSummary: Your obligations while working with people, including following the plan and protecting information.
review: { status: in-review, authoredBy: tester, authoredOn: '2026-09-15' }
provenance: { license: CC-BY-SA-4.0, updated: '2026-09-15' }
${extra}`;

	/*
	 * The same code with its numbering checked. Once the flag is true the schema insists
	 * the standards are actually listed and that they reconcile with `totalStandards`, so
	 * "verified" cannot be a claim made in isolation from the data.
	 */
	const verifiedCode = () =>
		code()
			.replace('standardsVerified: false', 'standardsVerified: true')
			.replace('totalStandards: 29', 'totalStandards: 2')
			.replace(
				`  - number: '2'
    ourLabel: How you deliver services`,
				`    standards:
      - number: '1.12'
        ourLabel: Keep gifts small, occasional and one-off
        ourSummary: Do not give or accept gifts worth more than a nominal amount with the people you serve.
  - number: '2'
    ourLabel: How you deliver services`
			)
			.replace(
				`review: { status: in-review`,
				`    standards:
      - number: '2.03'
        ourLabel: Stay professional during every work activity
        ourSummary: The standard covers training and supervision as much as it covers sessions with a learner.
review: { status: in-review`
			);

	function topic(overrides: Record<string, unknown> = {}) {
		return {
			id: 'gifts',
			ourLabel: 'Gifts, meals and favours',
			gloss: 'Why a small thank-you is a bigger problem than it looks',
			appliesTo: ['RBT'],
			sectionRefs: [{ codeId: 'rbt-ethics-code-2-0', section: '1' }],
			ourSummary:
				'Both codes place limits on giving and receiving gifts with the people you serve, because a gift changes a working relationship and creates an obligation running the wrong way.',
			plainSummary:
				'Gifts change a working relationship, even small ones. Know the rule before it happens, and tell your supervisor.',
			whatThisLooksLike: [
				'Knowing your organisation gift rule before a holiday arrives.',
				'Thanking a family warmly and explaining the limits you work under.'
			],
			commonPitfalls: ['Accepting just this once, which sets an expectation for next time.'],
			ifYouAreUnsure:
				'Do not accept it in the moment; say you will check the policy and come back to them.',
			citations: [{ sourceId: 'open-source-doc', useType: 'fact-reference' }],
			attestation,
			review,
			provenance,
			...overrides
		};
	}

	const files = (t: Record<string, unknown>, extra = '') => ({
		'ethics/codes/rbt-ethics-code-2-0.yaml': code(extra),
		'ethics/topics/gifts.md': frontmatter(t)
	});

	it('loads a code and a topic, counts them, and emits both assets', async () => {
		const r = await build(files(topic()));
		expect(r.errors).toEqual([]);
		expect(r.counts.ethicsTopics).toBe(1);
		expect(r.assets.map((a) => a.name)).toContain('ethics-codes');
		expect(r.assets.map((a) => a.name)).toContain('ethics-topics');
	});

	it('REJECTS a topic filed under a section the code does not have', async () => {
		const r = await build(
			files(topic({ sectionRefs: [{ codeId: 'rbt-ethics-code-2-0', section: '9' }] }))
		);
		expect(rules(r)).toContain('refs/unresolved');
	});

	it('REJECTS a standard number while the code says its numbering is unverified', async () => {
		const r = await build(
			files(
				topic({
					sectionRefs: [
						{ codeId: 'rbt-ethics-code-2-0', section: '1', standardNumbers: ['1.12'] }
					]
				})
			)
		);
		expect(rules(r)).toContain('refs/unverified-standard');
	});

	it('ACCEPTS a standard number once the code is marked verified', async () => {
		const r = await build(
			files(
				topic({
					sectionRefs: [
						{ codeId: 'rbt-ethics-code-2-0', section: '1', standardNumbers: ['1.12'] }
					]
				}),
				'\n'
			)
		);
		// Still rejected: the fixture above did not flip the flag.
		expect(rules(r)).toContain('refs/unverified-standard');

		const ok = await build({
			'ethics/codes/rbt-ethics-code-2-0.yaml': verifiedCode(),
			'ethics/topics/gifts.md': frontmatter(
				topic({
					sectionRefs: [
						{ codeId: 'rbt-ethics-code-2-0', section: '1', standardNumbers: ['1.12'] }
					]
				})
			)
		});
		expect(ok.errors).toEqual([]);
	});

	it('REJECTS a standard number that does not belong to its section', async () => {
		const r = await build({
			'ethics/codes/rbt-ethics-code-2-0.yaml': verifiedCode(),
			'ethics/topics/gifts.md': frontmatter(
				topic({
					sectionRefs: [
						{ codeId: 'rbt-ethics-code-2-0', section: '1', standardNumbers: ['2.03'] }
					]
				})
			)
		});
		expect(rules(r)).toContain('refs/unresolved');
	});

	it('REJECTS a standard number the code does not actually list', async () => {
		const r = await build({
			'ethics/codes/rbt-ethics-code-2-0.yaml': verifiedCode(),
			'ethics/topics/gifts.md': frontmatter(
				topic({
					sectionRefs: [
						{ codeId: 'rbt-ethics-code-2-0', section: '1', standardNumbers: ['1.99'] }
					]
				})
			)
		});
		// A typo in a citation is the same failure as a guess, arriving by a different route.
		expect(rules(r)).toContain('refs/unresolved');
	});

	it('REJECTS a code that lists standards while calling its numbering unverified', async () => {
		const r = await build({
			'ethics/codes/rbt-ethics-code-2-0.yaml': verifiedCode().replace(
				'standardsVerified: true',
				'standardsVerified: false'
			),
			'ethics/topics/gifts.md': frontmatter(topic())
		});
		expect(rules(r).some((x) => x.startsWith('schema/ethics-code'))).toBe(true);
	});

	it('REJECTS a code that claims verification but lists no standards', async () => {
		const r = await build({
			'ethics/codes/rbt-ethics-code-2-0.yaml': code().replace(
				'standardsVerified: false',
				'standardsVerified: true'
			),
			'ethics/topics/gifts.md': frontmatter(topic())
		});
		expect(rules(r).some((x) => x.startsWith('schema/ethics-code'))).toBe(true);
	});

	it('REJECTS a code whose standards do not add up to its stated total', async () => {
		const r = await build({
			'ethics/codes/rbt-ethics-code-2-0.yaml': verifiedCode().replace(
				'totalStandards: 2',
				'totalStandards: 29'
			),
			'ethics/topics/gifts.md': frontmatter(topic())
		});
		// The count is the cheapest possible check that a section did not lose an entry.
		expect(rules(r).some((x) => x.startsWith('schema/ethics-code'))).toBe(true);
	});

	it('REJECTS a topic claiming a credential none of its codes bind', async () => {
		const r = await build(files(topic({ appliesTo: ['BCBA'] })));
		expect(rules(r)).toContain('refs/unresolved');
	});

	it('REJECTS a code that carries the rights-holder text', async () => {
		const r = await build(
			files(topic(), 'officialText: Verbatim wording lifted from the code document.')
		);
		expect(rules(r).some((x) => x.startsWith('schema/ethics-code'))).toBe(true);
	});

	it('REJECTS a topic whose plain summary is not actually plain', async () => {
		const r = await build(
			files(
				topic({
					plainSummary:
						'Contingent acceptance of remuneration from stakeholders precipitates reciprocal obligations that compromise the objectivity requisite to clinical determinations.'
				})
			)
		);
		expect(rules(r)).toContain('editorial/plain-language-too-hard');
	});

	it('REJECTS a topic that lists itself as related', async () => {
		const r = await build(files(topic({ relatedTopics: ['gifts'] })));
		expect(rules(r)).toContain('refs/unresolved');
	});
});
