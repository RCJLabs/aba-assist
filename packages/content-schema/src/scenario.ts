import { z } from 'zod';
import { strictContent } from './guards.js';
import { Citations } from './source.js';
import { Attestation, Credential, Provenance, Review, Setting, Slug } from './primitives.js';
import { TaskRef } from './taxonomy.js';

/**
 * Situations where this app must refuse to instruct.
 *
 * Physical management is a certified, hands-on competency (Safety-Care, CPI, PRO-ACT),
 * not readable knowledge. The U.S. Department of Education's position is that restraint
 * and seclusion should never be used absent imminent danger of serious physical harm,
 * and ABAI's position statement opposes unnecessary restrictive intervention. An app
 * cannot assess imminent danger, cannot know the client's behaviour plan, and cannot
 * confirm the reader has been trained — so it must not describe procedure at all.
 */
export const RiskFlag = z.enum([
	'restraint',
	'seclusion',
	'self-injury',
	'medical-emergency',
	'suspected-abuse',
	'aggression-with-injury',
	'elopement-into-danger',
	'suicidal-ideation',
	'medication-question',
	'property-destruction-danger',
	'weapon'
]);
export type RiskFlag = z.infer<typeof RiskFlag>;

export const EscalationContact = z.enum([
	'supervising-bcba',
	'site-supervisor',
	'parent-guardian',
	'school-administrator',
	'nurse-or-medical',
	'emergency-services-911',
	'crisis-line-988',
	'child-protective-services',
	'adult-protective-services',
	'agency-safety-officer'
]);
export type EscalationContact = z.infer<typeof EscalationContact>;

/** Contacts that MUST appear for a given risk flag. Enforced below. */
export const REQUIRED_CONTACTS: Partial<Record<RiskFlag, readonly EscalationContact[]>> = {
	'medical-emergency': ['emergency-services-911'],
	'suicidal-ideation': ['crisis-line-988'],
	weapon: ['emergency-services-911']
};

export const EscalationBlock = z
	.strictObject({
		stopAndEscalate: z.literal(true),
		contacts: z.array(EscalationContact).min(1),
		/** Generic safety framing only — "ensure immediate physical safety". No technique. */
		immediateSafetyNote: z.string().min(20).max(400),
		mandatedReporterNote: z.string().max(400).nullable().default(null),
		documentation: z.array(z.string().min(10)).min(1),
		legalNote: z.string().min(20).max(400),
		/** The real, jurisdiction- and employer-specific rules always win. */
		consultYourPolicy: z.literal(true)
	})
	.check((ctx) => {
		if (!ctx.value.contacts.includes('supervising-bcba')) {
			ctx.issues.push({
				code: 'custom',
				message: 'every escalation block must route to the supervising BCBA',
				input: ctx.value.contacts
			});
		}
	});

const ScenarioBase = {
	id: Slug,
	title: z.string().min(5).max(120),
	situation: z.string().min(40).max(1200),
	setting: Setting,
	audience: z.array(Credential).min(1),
	/**
	 * How somebody would ask for this, in the words they would actually type.
	 *
	 * Search ranks words against words. Somebody reaching for an escalation card is not
	 * reaching for its title — they are mid-incident, and what they type is what is
	 * happening: "he is hitting his own head", not "self-injurious behavior". The corpus
	 * does not contain those words anywhere, which is a limitation established by measuring
	 * it rather than assumed, so no amount of better ranking reaches them.
	 *
	 * These live on the scenario rather than in a lookup table of their own, deliberately.
	 * A phrasing decides what a person sees in a crisis, which makes it exactly the kind of
	 * prose this app sends through tier A review — and a separate file would have been the
	 * first piece of safety routing in the repo to escape that.
	 *
	 * Written person-neutral. A phrasing that says "himself" answers half the readers who
	 * need it.
	 */
	askedAs: z.array(z.string().min(8).max(120)).default([]),
	tags: z.array(Slug).default([]),
	termRefs: z.array(Slug).default([]),
	taskRefs: z.array(TaskRef).default([]),
	ethicsRefs: z.array(Slug).default([]),
	citations: Citations,
	attestation: Attestation,
	review: Review,
	provenance: Provenance
} as const;

/**
 * THE SAFETY GUARD.
 *
 * A discriminated union whose members have different SHAPES, not just different
 * validation rules. `escalation-only` has no `steps` key anywhere in its schema, and
 * both members are strict — so writing procedural instruction into a restraint,
 * self-injury, or suspected-abuse scenario is a PARSE ERROR ("Unrecognized key: steps"),
 * not something a reviewer has to catch.
 *
 * Conversely `guidance` requires `riskFlags` to be empty, so a high-risk scenario cannot
 * masquerade as ordinary guidance. The build additionally runs a risk lexicon over
 * `guidance` prose to catch the author who simply forgot the flag.
 */
export const Scenario = z.discriminatedUnion('kind', [
	strictContent({
		...ScenarioBase,
		kind: z.literal('guidance'),
		riskFlags: z.array(RiskFlag).max(0).default([]),
		steps: z
			.array(
				z.strictObject({
					text: z.string().min(10).max(300),
					rationale: z.string().max(300).optional()
				})
			)
			.min(2)
			.max(8),
		whatNotToDo: z.array(z.string().min(10)).min(1),
		whenToEscalate: z.array(z.string().min(10)).min(1)
	}),
	strictContent({
		...ScenarioBase,
		kind: z.literal('escalation-only'),
		riskFlags: z.array(RiskFlag).min(1),
		escalation: EscalationBlock
		// Deliberately absent: `steps`, `whatNotToDo`. There is no procedure to give.
	})
]);
export type Scenario = z.infer<typeof Scenario>;

// The lexicons live in a Zod-free module so the app can import them without pulling the
// whole validation library into the browser bundle. Re-exported here so the schema
// barrel still carries them.
export {
	RISK_LEXICON,
	RESTRICTED_PROCEDURE_LEXICON,
	CLINICAL_DECISION_LEXICON
} from './lexicons.js';

/**
 * The one narrowing of the restricted-procedure rule, and why it is safe.
 *
 * A card whose entire purpose is to refuse has to be able to say what it is refusing.
 * "You have been told to restrain a learner" is the reader's situation, not a technique,
 * and a card that cannot name it is a card nobody recognises as theirs at the moment they
 * need it. So these two words may appear in a scenario's `title` and `situation` — and
 * only when the matching `riskFlag` is declared, so naming the situation and classifying
 * it cannot come apart.
 *
 * Everything else in the lexicon stays banned everywhere, and all of it — these two
 * included — stays banned inside the escalation block, which is where the app speaks
 * rather than where it repeats what happened to the reader.
 *
 * Build-side only, which is why it stays here beside the schema rather than moving to the
 * Zod-free module the app imports.
 */
export const NAMEABLE_WITH_FLAG: Partial<Record<RiskFlag, RegExp>> = {
	restraint: /^restrain\w*$/i,
	seclusion: /^(?:seclusion|seclude\w*)$/i
};
