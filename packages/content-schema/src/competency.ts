import { z } from 'zod';
import { ASSESSMENT_METHODS } from './runtime.js';
import { OfficialTextGuard, strictContent } from './guards.js';
import { Attestation, Credential, IsoDate, Provenance, Review, Slug } from './primitives.js';

/**
 * A competency assessment: a performance requirement, not a paper.
 *
 * The technician credential is not won by the written examination alone. Before applying,
 * a candidate has to demonstrate each task on this list to an assessor — with a client, in
 * a role-play, or in an interview — and an app that prepares people for the examination
 * while ignoring this prepares them for half of what stands in their way.
 *
 * Modelled the same way as the task list outlines, and for the same reason: the numbers,
 * the section names, the task labels and which methods are permitted are facts about a
 * published requirement, like a form's field names. The rights-holder's wording for what
 * each task says is theirs, so `OfficialTextGuard` types it null and every description
 * here is written from scratch.
 */

/**
 * How the assessor may evaluate a task.
 *
 * The values and their labels live in the Zod-free runtime module, because the page that
 * renders them must not pull the validation library in to do it. This builds the schema
 * from that single list rather than restating it.
 */
export const AssessmentMethod = z.enum(ASSESSMENT_METHODS);
export type AssessmentMethod = z.infer<typeof AssessmentMethod>;

/**
 * One of several things a single task will accept.
 *
 * At least one task is satisfied by demonstrating any one of a set of procedures, which
 * is worth modelling rather than flattening: a candidate choosing which to prepare is
 * making a real decision, and a list that hides the choice makes them prepare all three.
 */
export const CompetencyAlternative = strictContent({
	label: z.string().min(3).max(80),
	ourSummary: z.string().min(30).max(400),
	termRefs: z.array(Slug).default([])
});

export const CompetencyTask = strictContent({
	/** Position on the form, which is how an assessor and a candidate refer to it. */
	number: z.number().int().min(1).max(99),
	/** The short factual label the form gives the task. */
	label: z.string().min(3).max(80),
	/** Our own account of what the candidate has to be able to do. Never theirs. */
	ourSummary: z.string().min(40).max(700),
	plainSummary: z.string().min(20).max(300),
	/** Every method the form permits for this task. At least one. */
	methods: z.array(AssessmentMethod).min(1),
	/** Task-list codes this draws on, as "RBT:C.3". */
	taskRefs: z.array(z.string()).default([]),
	termRefs: z.array(Slug).default([]),
	/** Set where the task is satisfied by any one of several procedures. */
	alternatives: z.array(CompetencyAlternative).default([]),
	/**
	 * Where preparation means reading the employer's protocol rather than anything here.
	 * Set on the crisis task, which this app does not and will not teach.
	 */
	consultYourPolicy: z.boolean().default(false),
	...OfficialTextGuard
});

export const CompetencySection = strictContent({
	id: Slug,
	/** The factual section heading on the form. */
	title: z.string().min(3).max(80),
	ourDescription: z.string().min(40).max(600),
	tasks: z.array(CompetencyTask).min(1),
	/**
	 * A constraint the form places on the section as a whole, in our words — for example
	 * that some number of its tasks must be demonstrated with a client rather than acted.
	 */
	sectionRule: z.string().max(400).nullable().default(null)
});

export const CompetencyRule = strictContent({
	label: z.string().min(3).max(80),
	value: z.string().min(10).max(600),
	/** Where in the source document this was read. */
	locator: z.string().max(160)
});

export const CompetencyAssessment = z
	.strictObject({
		id: Slug,
		credential: Credential,
		/** Factual title of the requirement, e.g. "Initial Competency Assessment". */
		name: z.string().min(3).max(120),
		edition: z.string().min(1).max(40),
		effectiveDate: IsoDate,
		issuer: z.enum(['BACB', 'QABA']),
		sourceId: Slug,
		/**
		 * False until somebody has read the packet itself. The task count is the thing a
		 * candidate will check against their own form, so asserting one nobody verified is
		 * the worst kind of wrong: confidently, checkably incorrect.
		 */
		countsVerified: z.boolean().default(false),
		ourOverview: z.string().min(80).max(1200),
		sections: z.array(CompetencySection).min(1),
		/** Assessor, timing, structure and documentation requirements, in our words. */
		rules: z.array(CompetencyRule).default([]),
		attestation: Attestation,
		review: Review,
		provenance: Provenance,
		...OfficialTextGuard
	})
	.check((ctx) => {
		const c = ctx.value;
		const fail = (message: string) =>
			ctx.issues.push({ code: 'custom', message: `${c.id}: ${message}`, input: c });

		const tasks = c.sections.flatMap((s) => s.tasks);

		// Numbered 1..n with no gaps and no repeats: a candidate reads these against a
		// printed form, and a missing number reads as a missing requirement.
		const numbers = tasks.map((t) => t.number).sort((a, b) => a - b);
		const expected = Array.from({ length: numbers.length }, (_, i) => i + 1);
		if (numbers.join(',') !== expected.join(',')) {
			fail(
				`task numbers must run 1..${numbers.length} with no gaps; got ${numbers.join(', ')}`
			);
		}

		for (const t of tasks) {
			if (new Set(t.methods).size !== t.methods.length) {
				fail(`task ${t.number} repeats an assessment method`);
			}
			// One alternative is not a choice, it is the task.
			if (t.alternatives.length === 1) {
				fail(
					`task ${t.number} lists a single alternative; either add the others or fold it in`
				);
			}
		}

		if (c.countsVerified && tasks.length === 0) fail('countsVerified with no tasks');
	});

export type CompetencyAssessment = z.infer<typeof CompetencyAssessment>;
export type CompetencyTask = z.infer<typeof CompetencyTask>;
export type CompetencySection = z.infer<typeof CompetencySection>;
