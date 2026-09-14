import { describe, expect, it } from 'vitest';
import { Scenario } from './scenario.js';
import { Term } from './term.js';
import { SourceRegistry, Citation } from './source.js';
import { SuperviseeCode, findPhiHints } from './guards.js';
import { ALLOWED_STATUSES } from './primitives.js';

/**
 * These tests exist to prove the guards FIRE. A guard that has never been observed to
 * reject anything is not a guard — it is a comment. Each case below is a thing an
 * author could plausibly do, and each must fail.
 */

const attestation = {
	originalProse: true as const,
	noVerbatimSource: true as const,
	consulted: 'Michael 1982; Laraway et al. 2003. Textbook not consulted.'
};
const review = { status: 'draft' as const, authoredBy: 'claude', authoredOn: '2026-09-14' };
const provenance = { license: 'CC-BY-SA-4.0' as const, updated: '2026-09-14' };
const citations = [{ sourceId: 'michael-1982', useType: 'original-synthesis' as const }];

function baseTerm(overrides: Record<string, unknown> = {}) {
	return {
		id: 'motivating-operation',
		term: 'Motivating Operation',
		category: 'principles',
		definition: {
			technical:
				'An environmental variable that alters the reinforcing effectiveness of a stimulus and correspondingly alters the frequency of behaviour that has produced it.',
			plain:
				'Something that changes how much a person wants a thing right now, and so changes how hard they work for it.',
			gloss: 'Changes how much a consequence is wanted right now'
		},
		examples: [
			{ text: 'After hours without water, water becomes more effective as a reinforcer.' }
		],
		nonExamples: [
			{
				text: 'A picture card that signals water is available changes availability, not wanting.'
			}
		],
		citations,
		attestation,
		review,
		provenance,
		...overrides
	};
}

describe('copyright guard', () => {
	it('accepts a term that leaves the official-text fields alone', () => {
		expect(Term.safeParse(baseTerm()).success).toBe(true);
	});

	it('REJECTS a non-null officialText', () => {
		const r = Term.safeParse(baseTerm({ officialText: 'Verbatim text from a task list.' }));
		expect(r.success).toBe(false);
		expect(JSON.stringify(r.error?.issues)).toMatch(/expected null/i);
	});

	it('REJECTS a non-null officialTitle (headings are their text too)', () => {
		const r = Term.safeParse(
			baseTerm({ officialTitle: 'C-3 Implement discrete-trial teaching' })
		);
		expect(r.success).toBe(false);
	});

	it('REJECTS a stray unknown key such as officialText2', () => {
		const r = Term.safeParse(baseTerm({ officialText2: 'sneaking it in' }));
		expect(r.success).toBe(false);
		expect(JSON.stringify(r.error?.issues)).toMatch(/unrecognized|unknown/i);
	});

	it('REJECTS an all-rights-reserved source that claims quotation is allowed', () => {
		const r = SourceRegistry.safeParse({
			sources: [
				{
					id: 'cooper-2020',
					kind: 'book',
					title: 'Applied Behavior Analysis',
					rights: 'all-rights-reserved',
					quotationAllowed: true
				}
			]
		});
		expect(r.success).toBe(false);
		expect(JSON.stringify(r.error?.issues)).toMatch(/quotationAllowed/);
	});

	it('REJECTS a quotation citation with no quoted text, and vice versa', () => {
		expect(Citation.safeParse({ sourceId: 'x', useType: 'quotation' }).success).toBe(false);
		expect(
			Citation.safeParse({ sourceId: 'x', useType: 'fact-reference', quotedText: 'hello' })
				.success
		).toBe(false);
	});

	it('REJECTS a term with no citations at all', () => {
		expect(Term.safeParse(baseTerm({ citations: [] })).success).toBe(false);
	});

	it('REJECTS an author who will not attest to original prose', () => {
		const r = Term.safeParse(
			baseTerm({ attestation: { ...attestation, noVerbatimSource: false } })
		);
		expect(r.success).toBe(false);
	});
});

describe('safety guard', () => {
	const scenarioBase = {
		id: 'client-refuses-a-demand',
		title: 'A learner pushes the task materials away during a demand',
		situation:
			'You present a known task and the learner pushes the materials off the table and turns away. No one is at risk of harm.',
		setting: 'clinic',
		audience: ['RBT'],
		citations,
		attestation,
		review,
		provenance
	};

	it('accepts an ordinary guidance scenario with steps', () => {
		const r = Scenario.safeParse({
			...scenarioBase,
			kind: 'guidance',
			steps: [
				{ text: 'Stay calm and keep your own responses neutral and consistent.' },
				{ text: 'Follow the learner’s written plan for this task rather than improvising.' }
			],
			whatNotToDo: ['Do not invent a new consequence that is not in the plan.'],
			whenToEscalate: ['Tell your supervisor the same day if this is a new pattern.']
		});
		expect(r.success).toBe(true);
	});

	it('REJECTS `steps` on an escalation-only scenario — the field does not exist', () => {
		const r = Scenario.safeParse({
			...scenarioBase,
			id: 'self-injury-with-bleeding',
			kind: 'escalation-only',
			riskFlags: ['self-injury'],
			escalation: {
				stopAndEscalate: true,
				contacts: ['supervising-bcba', 'emergency-services-911'],
				immediateSafetyNote: 'Ensure immediate physical safety and summon help.',
				documentation: ['Record what happened and when you notified your supervisor.'],
				legalNote: 'Your employer’s crisis protocol and state law govern this situation.',
				consultYourPolicy: true
			},
			steps: [{ text: 'Apply a two-person hold until the behaviour stops.' }]
		});
		expect(r.success).toBe(false);
		expect(JSON.stringify(r.error?.issues)).toMatch(/unrecognized|unknown/i);
	});

	it('REJECTS a guidance scenario that declares risk flags', () => {
		const r = Scenario.safeParse({
			...scenarioBase,
			kind: 'guidance',
			riskFlags: ['restraint'],
			steps: [{ text: 'Something something.' }, { text: 'Something else entirely.' }],
			whatNotToDo: ['Do not improvise.'],
			whenToEscalate: ['Tell your supervisor.']
		});
		expect(r.success).toBe(false);
	});

	it('REJECTS an escalation block that does not route to the supervising BCBA', () => {
		const r = Scenario.safeParse({
			...scenarioBase,
			id: 'suspected-abuse-disclosure',
			kind: 'escalation-only',
			riskFlags: ['suspected-abuse'],
			escalation: {
				stopAndEscalate: true,
				contacts: ['child-protective-services'],
				immediateSafetyNote: 'Ensure the person is safe and not left alone.',
				documentation: ['Write down exactly what was said, in the speaker’s words.'],
				legalNote: 'Mandated-reporter duties are set by state law, not by your employer.',
				consultYourPolicy: true
			}
		});
		expect(r.success).toBe(false);
		expect(JSON.stringify(r.error?.issues)).toMatch(/supervising BCBA/);
	});
});

describe('PHI guard', () => {
	it('accepts a non-identifying supervisee code', () => {
		expect(SuperviseeCode.safeParse('S-04').success).toBe(true);
		expect(SuperviseeCode.safeParse('BT12').success).toBe(true);
	});

	it('REJECTS anything shaped like a person’s name', () => {
		expect(SuperviseeCode.safeParse('Jordan').success).toBe(false);
		expect(SuperviseeCode.safeParse('Jordan Smith').success).toBe(false);
		expect(SuperviseeCode.safeParse('j.smith').success).toBe(false);
	});

	it('flags likely identifiers in free text', () => {
		expect(findPhiHints('Session went well.')).toEqual([]);
		expect(findPhiHints('Reviewed goals with Jordan Smith')).toContain('possible full name');
		expect(findPhiHints('DOB 2015-04-02')).toContain('possible date of birth');
	});
});

describe('review ladder', () => {
	it('lets drafts through in dev but never in release', () => {
		expect(ALLOWED_STATUSES.dev).toContain('draft');
		expect(ALLOWED_STATUSES.pr).not.toContain('draft');
		expect(ALLOWED_STATUSES.release).not.toContain('draft');
		expect(ALLOWED_STATUSES.release).not.toContain('in-review');
		expect(ALLOWED_STATUSES.release).toEqual(['approved']);
	});
});
