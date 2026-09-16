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
	channel: Channel = 'pr',
	minimumTerms?: number
): Promise<Awaited<ReturnType<typeof compile>>> {
	const root = await mkdtemp(join(tmpdir(), 'aba-content-'));
	await mkdir(join(root, '_registry'), { recursive: true });
	await writeFile(join(root, '_registry', 'sources.yaml'), SOURCES);
	for (const [rel, content] of Object.entries(files)) {
		const path = join(root, rel);
		await mkdir(join(path, '..'), { recursive: true });
		await writeFile(path, content);
	}
	return compile({ root, channel, outDir: join(root, '.out'), minimumTerms });
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

	/*
	 * The narrow allowance, checked in all four directions.
	 *
	 * A refusal card has to be able to say what it is refusing, or nobody recognises it as
	 * theirs. What it must never do is describe how the thing is done, or name a
	 * restricted procedure it has not also classified as one.
	 */
	const restraintCard = (over: Record<string, unknown> = {}) => ({
		...scenarioBase,
		kind: 'escalation-only',
		riskFlags: ['restraint'],
		title: 'You have been told to restrain a learner',
		situation:
			'A colleague or a supervisor tells you to restrain the learner, and expects you to do it now, in front of you.',
		escalation: {
			stopAndEscalate: true,
			contacts: ['supervising-bcba', 'site-supervisor'],
			immediateSafetyNote:
				'Make sure everybody in the room is safe, and say plainly that you have not been trained and certified for this.',
			documentation: ['Write down who asked, when, and what you said.'],
			legalNote:
				'State law, federal guidance and your employer policy govern this entirely, and certified training is a precondition.',
			consultYourPolicy: true
		},
		...over
	});

	it('ACCEPTS a card that names the restricted procedure it exists to refuse', async () => {
		const r = await build({ 'scenarios/a-scenario.md': frontmatter(restraintCard()) });
		expect(rules(r)).toEqual([]);
	});

	it('REJECTS naming a restricted procedure without the matching flag', async () => {
		const r = await build({
			'scenarios/a-scenario.md': frontmatter(
				restraintCard({ riskFlags: ['aggression-with-injury'] })
			)
		});
		expect(rules(r)).toContain('safety/procedure-in-escalation');
	});

	it('REJECTS a situation that describes how the procedure is done', async () => {
		const r = await build({
			'scenarios/a-scenario.md': frontmatter(
				restraintCard({
					situation:
						'Your supervisor shows you how to hold the client from behind and asks you to practise it on a colleague first.'
				})
			)
		});
		expect(rules(r)).toContain('safety/procedure-in-escalation');
	});

	it('REJECTS the named word inside the escalation block, flag or no flag', async () => {
		const r = await build({
			'scenarios/a-scenario.md': frontmatter(
				restraintCard({
					escalation: {
						...restraintCard().escalation,
						legalNote:
							'Restrain the learner only where state law and your employer policy both permit it.'
					}
				})
			)
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

	it('WITHHOLDS in-review content from the release channel', async () => {
		/*
		 * This used to assert that the build failed. It no longer does, deliberately: the
		 * reader is protected by the entry being left out, which is the same guarantee at a
		 * far lower price than refusing to publish anything at all. What the build still
		 * refuses is to call itself a release on an empty glossary.
		 */
		const r = await build(
			{ 'terms/principles/sample-term.md': frontmatter(term()) },
			'release'
		);
		expect(rules(r)).not.toContain('review/status-not-shippable');
		expect(r.counts.terms).toBe(0);
		expect(r.counts.withheld).toBe(1);
	});

	it('REJECTS an approved term that does not say how it was approved', async () => {
		const r = await build(
			{
				'terms/principles/sample-term.md': frontmatter(
					term({
						review: {
							status: 'approved',
							authoredBy: 'tester',
							authoredOn: '2026-09-14',
							reviewedBy: 'evan',
							reviewedOn: '2026-09-15'
						}
					})
				)
			},
			'release'
		);
		expect(r.errors.map((e) => e.message).join(' ')).toMatch(
			/approved without recording whether it was read or carried/
		);
	});

	it('REJECTS a sampled approval that does not name its draw, and the reverse', async () => {
		const approved = {
			status: 'approved',
			authoredBy: 'tester',
			authoredOn: '2026-09-14',
			reviewedBy: 'evan',
			reviewedOn: '2026-09-15'
		};
		const unnamed = await build({
			'terms/principles/sample-term.md': frontmatter(
				term({ reviewMethod: 'sampled', review: approved })
			)
		});
		expect(unnamed.errors.map((e) => e.message).join(' ')).toMatch(/no sample is named/);

		const spurious = await build({
			'terms/principles/sample-term.md': frontmatter(
				term({
					reviewMethod: 'read',
					sampledWith: 'term:principles@v:2-of-9',
					review: approved
				})
			)
		});
		expect(spurious.errors.map((e) => e.message).join(' ')).toMatch(
			/names a sample but reviewMethod is not/
		);
	});

	it('REJECTS an item approved by its own author', async () => {
		const r = await build(
			{
				'terms/principles/sample-term.md': frontmatter(
					term({
						// A valid approval in every other respect, so the self-review rule is
						// what rejects it rather than a missing method.
						reviewMethod: 'read',
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

describe('the search index', () => {
	/*
	 * The home screen is a search box, so what this index covers decides what the app
	 * appears to contain. It covered only the glossary for a long time, which meant a
	 * technician typing "gift" got a definition and never the ethics topic that answers
	 * the question they were actually asking, and typing "self injury" got nothing.
	 */
	function storedDocs(r: Awaited<ReturnType<typeof compile>>) {
		const asset = r.assets.find((a) => a.name === 'search-index');
		const mini = JSON.parse(asset!.source) as {
			documentCount: number;
			storedFields: Record<string, Record<string, unknown>>;
		};
		return Object.values(mini.storedFields);
	}

	const guidance = {
		id: 'a-reinforcer-stops-working',
		kind: 'guidance',
		title: 'The reinforcer stops working mid-session',
		situation:
			'The item that was working at the start of the session no longer seems to be worth anything to the learner.',
		setting: 'clinic',
		audience: ['RBT'],
		riskFlags: [],
		steps: [
			{
				text: 'Offer a choice from the items the plan lists, and record which one is taken.',
				rationale: 'Preference moves within a session, and the plan usually anticipates that.'
			},
			{
				text: 'Note how long the item held attention, and tell your supervisor the pattern.',
				rationale: 'A reinforcer that fades within a session is information the plan needs.'
			}
		],
		whatNotToDo: ['Do not introduce something the plan does not name.'],
		whenToEscalate: [
			'Tell your supervisor if nothing on the list is working across sessions.'
		],
		termRefs: [],
		citations: [{ sourceId: 'open-source-doc', useType: 'fact-reference' }],
		attestation,
		review,
		provenance
	};

	const escalation = {
		id: 'someone-is-hurt',
		kind: 'escalation-only',
		title: 'Somebody has been hurt',
		situation:
			'An incident has happened during a session and somebody — the learner, you, or another person — has been injured.',
		setting: 'clinic',
		audience: ['RBT'],
		riskFlags: ['self-injury', 'medical-emergency'],
		escalation: {
			stopAndEscalate: true,
			contacts: ['supervising-bcba', 'emergency-services-911'],
			immediateSafetyNote:
				'Make sure everybody is physically safe, and get the help your organisation protocol names.',
			mandatedReporterNote: null,
			documentation: ['Write down what happened and when, as soon as it is safe to do so.'],
			legalNote: 'Your employer and your state decide what has to happen next.',
			consultYourPolicy: true
		},
		termRefs: [],
		citations: [{ sourceId: 'open-source-doc', useType: 'fact-reference' }],
		attestation,
		review,
		provenance
	};

	it('indexes every kind, not only the glossary', async () => {
		const r = await build({
			'terms/principles/sample-term.md': frontmatter(term()),
			'scenarios/guidance/a-reinforcer-stops-working.md': frontmatter(guidance),
			'scenarios/escalation/someone-is-hurt.md': frontmatter(escalation)
		});
		expect(r.errors).toEqual([]);
		const kinds = storedDocs(r).map((d) => d.k);
		expect(new Set(kinds)).toEqual(new Set(['term', 'scenario']));
		expect(storedDocs(r)).toHaveLength(3);
	});

	it('labels a crisis card differently from ordinary guidance', async () => {
		const r = await build({
			'terms/principles/sample-term.md': frontmatter(term()),
			'scenarios/guidance/a-reinforcer-stops-working.md': frontmatter(guidance),
			'scenarios/escalation/someone-is-hurt.md': frontmatter(escalation)
		});
		const docs = storedDocs(r);
		expect(docs.find((d) => d.i === 'someone-is-hurt')!.l).toBe('Stop and escalate');
		expect(docs.find((d) => d.i === 'a-reinforcer-stops-working')!.l).toBe('Situation');
	});

	it('stores what a row needs to render and filter, and nothing more', async () => {
		const r = await build({ 'terms/principles/sample-term.md': frontmatter(term()) });
		const doc = storedDocs(r)[0]!;
		expect(Object.keys(doc).sort()).toEqual(['b', 'c', 'g', 'i', 'k', 'l', 'p', 'r', 't']);
		// Never the body. This index is parsed on a phone, and the corpus does not belong
		// in it twice.
		expect(JSON.stringify(doc)).not.toContain('precise statement of the concept');
	});

	it('ranks a definition above an exam task', async () => {
		// A task statement is a pointer into an outline rather than a reading, so it must
		// not outrank the entry that explains the same word.
		const r = await build({ 'terms/principles/sample-term.md': frontmatter(term()) });
		expect(Number(storedDocs(r)[0]!.b)).toBeGreaterThan(0.55);
	});

	it('carries the category for terms and null for everything else', async () => {
		// The category filter is a glossary concept; a situation has no category to match,
		// which is what stops one leaking through a narrowed filter.
		const r = await build({
			'terms/principles/sample-term.md': frontmatter(term()),
			'scenarios/guidance/a-reinforcer-stops-working.md': frontmatter(guidance)
		});
		const docs = storedDocs(r);
		expect(docs.find((d) => d.k === 'term')!.c).toBe('principles');
		expect(docs.find((d) => d.k === 'scenario')!.c).toBeNull();
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

describe('graphs', () => {
	const graph = (over: Record<string, unknown> = {}) => ({
		id: 'sample-graph',
		title: 'A sample graph of something',
		gloss: 'What the graph is for, in one short line',
		audience: ['RBT'],
		fictional: true,
		design: 'ab',
		x: { label: 'Session', from: 1, to: 6, tickEvery: 1, unit: 'session' },
		y: { label: 'Count', from: 0, to: 10, tickEvery: 2, unit: 'response' },
		phases: [
			{ id: 'baseline', label: 'Baseline', from: 1, to: 3 },
			{ id: 'teaching', label: 'Teaching', from: 4, to: 6, changeNote: 'Teaching began here.' }
		],
		series: [
			{
				id: 'count',
				label: 'Count',
				marker: 'circle',
				points: [
					{ x: 1, y: 1 },
					{ x: 2, y: 2 },
					{ x: 3, y: 1 },
					{ x: 4, y: 6 },
					{ x: 5, y: 7 },
					{ x: 6, y: 8 }
				]
			}
		],
		longDescription:
			'A line graph across six sessions. During Baseline the count stays between one and two. During Teaching it rises from six to eight, with a phase-change line between the two conditions.',
		teaching:
			'A short explanation of what the reader is meant to take away from this graph, long enough to clear the minimum the schema sets for the field.',
		plainSummary:
			'The dots are low at first. Then the plan changed. Then the dots go up and stay up.',
		citations: [{ sourceId: 'open-source-doc', useType: 'fact-reference' }],
		attestation,
		review,
		provenance,
		...over
	});

	const yaml = (obj: Record<string, unknown>) => JSON.stringify(obj, null, 2);

	it('accepts a well-formed graph', async () => {
		const r = await build({ 'graphs/sample-graph.yaml': yaml(graph()) });
		expect(rules(r)).toEqual([]);
		expect(r.counts.graphs).toBe(1);
	});

	it('refuses a graph that claims to be real', async () => {
		const r = await build({ 'graphs/sample-graph.yaml': yaml(graph({ fictional: false })) });
		expect(rules(r)).toContain('schema/graph');
	});

	it('refuses a point plotted outside the axes, which would be silently clipped', async () => {
		const bad = graph();
		(bad.series[0] as { points: { x: number; y: number }[] }).points[3] = { x: 4, y: 40 };
		const r = await build({ 'graphs/sample-graph.yaml': yaml(bad) });
		expect(r.errors.map((e) => e.message).join(' ')).toMatch(/outside the axes/);
	});

	it('refuses conditions that leave a gap in the record', async () => {
		const r = await build({
			'graphs/sample-graph.yaml': yaml(
				graph({
					phases: [
						{ id: 'baseline', label: 'Baseline', from: 1, to: 2 },
						{
							id: 'teaching',
							label: 'Teaching',
							from: 4,
							to: 6,
							changeNote: 'Teaching began here.'
						}
					]
				})
			)
		});
		expect(r.errors.map((e) => e.message).join(' ')).toMatch(/gap or overlap/);
	});

	it('refuses a truncated vertical axis with no explanation, and an explanation with no truncation', async () => {
		const truncated = await build({
			'graphs/sample-graph.yaml': yaml(
				graph({ y: { label: 'Count', from: 4, to: 10, tickEvery: 2, unit: 'response' } })
			)
		});
		expect(truncated.errors.map((e) => e.message).join(' ')).toMatch(/rather than 0/);

		const spurious = await build({
			'graphs/sample-graph.yaml': yaml(
				graph({ yAxisNote: 'A note explaining an axis that does not need explaining.' })
			)
		});
		expect(spurious.errors.map((e) => e.message).join(' ')).toMatch(
			/but the axis starts at 0/
		);
	});

	it('refuses a description that does not name every condition', async () => {
		const r = await build({
			'graphs/sample-graph.yaml': yaml(
				graph({
					longDescription:
						'A line graph across six sessions. During Baseline the count stays low, and then it rises to eight by the last session without saying what changed.'
				})
			)
		});
		expect(r.errors.map((e) => e.message).join(' ')).toMatch(/never mentions the "Teaching"/);
	});

	it('refuses two series that would differ by colour alone', async () => {
		const r = await build({
			'graphs/sample-graph.yaml': yaml(
				graph({
					series: [
						graph().series[0],
						{
							...graph().series[0],
							id: 'other',
							label: 'Another count'
						}
					]
				})
			)
		});
		expect(r.errors.map((e) => e.message).join(' ')).toMatch(/share a marker shape/);
	});

	it('refuses a multiple baseline whose tiers change at the same time', async () => {
		const tier = (id: string, marker: string) => ({
			id,
			label: id,
			marker,
			points: [
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
				{ x: 3, y: 1 },
				{ x: 4, y: 5 },
				{ x: 5, y: 6 },
				{ x: 6, y: 7 }
			]
		});
		const phases = (seriesId: string) => [
			{ id: `${seriesId}-b`, label: 'Baseline', from: 1, to: 3, seriesId },
			{
				id: `${seriesId}-t`,
				label: 'Teaching',
				from: 4,
				to: 6,
				seriesId,
				changeNote: 'Teaching began here.'
			}
		];
		const r = await build({
			'graphs/sample-graph.yaml': yaml(
				graph({
					design: 'multiple-baseline',
					series: [tier('one', 'circle'), tier('two', 'square')],
					phases: [...phases('one'), ...phases('two')]
				})
			)
		});
		expect(r.errors.map((e) => e.message).join(' ')).toMatch(/not staggered/);
	});

	it('puts graphs in the search index, findable by design name', async () => {
		const r = await build({ 'graphs/sample-graph.yaml': yaml(graph()) });
		const asset = r.assets.find((a) => a.name === 'search-index');
		expect(asset).toBeDefined();
		expect(asset!.source).toContain('"k":"graph"');
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

describe('the release channel withholds rather than refuses', () => {
	/*
	 * The property under test is the one the whole change turns on: a reader never sees an
	 * unapproved entry, and that is now achieved by leaving it out rather than by refusing
	 * to build. Refusing made launch all-or-nothing, which is what turned a review queue
	 * into a wall.
	 */
	const approved = {
		status: 'approved',
		authoredBy: 'tester',
		authoredOn: '2026-09-14',
		reviewedBy: 'reviewer',
		reviewedOn: '2026-09-15'
	};
	/** `reviewMethod` sits on the term itself, not inside its review block. */
	const read = { review: approved, reviewMethod: 'read' };
	/** A second term needs its own prose, or the duplicate-prose guard fires first. */
	const other = {
		definition: {
			technical:
				'An entirely separate statement about a different concept, written out at enough length to clear the schema minimum.',
			plain: 'Another easy way of saying a different thing so a new reader can follow along.',
			gloss: 'A different summary line'
		}
	};

	/** A release build needs its required kinds complete, so hand it none of them. */
	const release = (files: Record<string, string>, minimumTerms = 1) =>
		build(files, 'release', minimumTerms);

	it('ships the approved term and leaves the unapproved one out', async () => {
		const r = await release({
			'terms/principles/kept.md': frontmatter(term({ id: 'kept', term: 'Kept', ...read })),
			'terms/principles/held.md': frontmatter(term({ id: 'held', term: 'Held', ...other }))
		});
		expect(rules(r)).toEqual([]);
		expect(r.ok).toBe(true);
		expect(r.counts.terms).toBe(1);
		expect(r.counts.withheld).toBe(1);
		// Nothing a reader can reach is unreviewed — which is what the preview banner reads.
		expect(r.counts.unreviewed).toBe(0);
	});

	it('still checks the entry it is withholding', async () => {
		/*
		 * Withholding must not become a way past the guards. An entry that is left out is
		 * still parsed, rights-checked and read for risk language, because it is a file in
		 * the repository that will one day be approved — and because a build that only
		 * validates what it happens to ship would quietly stop validating.
		 */
		const r = await release({
			'terms/principles/kept.md': frontmatter(term({ id: 'kept', term: 'Kept', ...read })),
			'terms/principles/held.md': frontmatter(
				term({
					id: 'held',
					term: 'Held',
					...other,
					citations: [
						{
							sourceId: 'closed-book',
							useType: 'quotation',
							quotedText: 'A sentence lifted straight out of the textbook.'
						}
					]
				})
			)
		});
		expect(rules(r)).toContain('rights/quotation-not-permitted');
	});

	it('prunes a reference into a withheld entry, and keeps contrast symmetric', async () => {
		const r = await release({
			'terms/principles/kept.md': frontmatter(
				term({ id: 'kept', term: 'Kept', ...read, contrastWith: ['held'] })
			),
			'terms/principles/held.md': frontmatter(
				term({ id: 'held', term: 'Held', ...other, contrastWith: ['kept'] })
			)
		});
		expect(rules(r)).toEqual([]);
		const index = r.assets.find((a) => a.name === 'terms.index');
		expect(index).toBeDefined();
		// The shipped term carries no link into a page that is not there.
		expect(index!.source).not.toContain('held');
	});

	it('still refuses a reference to something that does not exist', async () => {
		// Withheld and absent are different failures, and only one of them is a mistake.
		const r = await release({
			'terms/principles/kept.md': frontmatter(
				term({ id: 'kept', term: 'Kept', ...read, seeAlso: ['no-such-term'] })
			)
		});
		expect(rules(r)).toContain('refs/unresolved');
	});

	it('refuses to call itself a release with the glossary below the floor', async () => {
		const r = await release(
			{
				'terms/principles/kept.md': frontmatter(term({ id: 'kept', term: 'Kept', ...read }))
			},
			2
		);
		expect(rules(r)).toContain('release/below-minimum');
	});

	it('refuses while any escalation card is unapproved', async () => {
		/*
		 * The safety surface is required whole. A card withheld while its neighbours ship
		 * leaves a gap exactly where somebody is looking for the worst case, and that is a
		 * worse outcome than the build not shipping.
		 */
		const r = await release({
			'terms/principles/kept.md': frontmatter(term({ id: 'kept', term: 'Kept', ...read })),
			'scenarios/a-scenario.md': frontmatter({
				id: 'a-scenario',
				title: 'A learner is injuring themselves',
				situation:
					'The learner is hurting themselves and the behaviour is escalating in front of you right now.',
				setting: 'clinic',
				audience: ['RBT'],
				citations: [{ sourceId: 'open-source-doc', useType: 'fact-reference' }],
				attestation,
				review,
				provenance,
				kind: 'escalation-only',
				riskFlags: ['self-injury'],
				escalation: {
					stopAndEscalate: true,
					contacts: ['supervising-bcba', 'emergency-services-911'],
					immediateSafetyNote:
						'Get help now and follow the crisis protocol your employer has trained you on.',
					documentation: ['Write down what happened and when.'],
					legalNote: 'State law and your employer policy govern this situation entirely.',
					consultYourPolicy: true
				}
			})
		});
		expect(rules(r)).toContain('release/incomplete-required');
	});

	it('leaves the other channels alone', async () => {
		const draft = {
			'terms/principles/held.md': frontmatter(
				term({ id: 'held', review: { ...review, status: 'draft' } })
			)
		};
		// A draft in a pull request is the author's to fix, not something to quietly drop.
		expect(rules(await build(draft, 'pr'))).toContain('review/status-not-shippable');

		const dev = await build(draft, 'dev');
		expect(rules(dev)).toEqual([]);
		expect(dev.counts.terms).toBe(1);
		expect(dev.counts.withheld).toBe(0);
	});
});

describe('an alias has to be another name for the same thing', () => {
	const pair = (aliases: string[], abbreviation?: string) => ({
		'terms/principles/sample-term.md': frontmatter(term({ aliases, abbreviation })),
		'terms/principles/other-term.md': frontmatter(
			term({
				id: 'other-term',
				term: 'Other Term',
				abbreviation: 'OT',
				definition: {
					technical:
						'A different concept entirely, stated at enough length to satisfy the minimum the schema imposes on this field.',
					plain:
						'Another short and easy way to say a different thing so a new reader can follow.',
					gloss: 'A different summary line'
				}
			})
		)
	});

	it('REJECTS an alias that is another entry’s name', async () => {
		const r = await build(pair(['Other Term']));
		expect(rules(r)).toContain('editorial/alias-names-another-term');
	});

	it('REJECTS an alias that is another entry’s abbreviation', async () => {
		const r = await build(pair(['OT']));
		expect(rules(r)).toContain('editorial/alias-names-another-term');
	});

	// "MTS" is both matching-to-sample and momentary-time-sampling, and both are right.
	it('allows two entries to declare the same abbreviation', async () => {
		const r = await build(pair(['OT'], 'OT'));
		expect(rules(r)).not.toContain('editorial/alias-names-another-term');
	});

	it('leaves an ordinary synonym alone', async () => {
		const r = await build(pair(['sample terminology']));
		expect(rules(r)).not.toContain('editorial/alias-names-another-term');
	});
});
