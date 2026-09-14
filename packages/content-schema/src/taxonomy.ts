import { z } from 'zod';
import { strictContent } from './guards.js';
import { Attestation, Credential, IsoDate, Provenance, Review, Slug } from './primitives.js';

/**
 * Task-code shapes per credential. Codes are FACTS — reference identifiers, like a
 * statute section number — so we model them freely. What we never model is the
 * rights-holder's wording for what each code says; see `ourSummary`.
 */
export const TASK_CODE_PATTERN: Partial<Record<z.infer<typeof Credential>, RegExp>> = {
	RBT: /^[A-F]-([1-9]|1[0-9])$/,
	BCBA: /^[A-I]\.([1-9]|1[0-9])$/,
	BCaBA: /^[A-I]\.([1-9]|1[0-9])$/
};

export const TaskCode = strictContent({
	code: z.string().min(2).max(8),
	/** Our own restatement of what the task covers. NEVER the rights-holder's wording. */
	ourSummary: z.string().min(30).max(300),
	plainSummary: z.string().min(20).max(240),
	keywords: z.array(z.string()).default([]),
	termRefs: z.array(Slug).default([]),
	attestation: Attestation
});

export const Domain = strictContent({
	letter: z.string().regex(/^[A-I]$/),
	/** Short factual domain name, e.g. "Data Collection and Graphing". */
	name: z.string().min(3).max(80),
	ourDescription: z.string().min(40).max(500),
	examWeightPercent: z.number().min(0).max(100).nullable(),
	tasks: z.array(TaskCode).default([])
});

export const ContentOutline = z
	.strictObject({
		id: Slug,
		credential: Credential,
		edition: z.string(),
		effectiveDate: IsoDate,
		issuer: z.enum(['BACB', 'QABA']),
		sourceId: Slug,
		/** e.g. bcaba-tco-6 is a subset of bcba-tco-6. */
		subsetOf: Slug.nullable().default(null),
		/**
		 * Set false where a count could not be confirmed against the primary document.
		 * The build refuses to enforce totals it knows are unverified rather than
		 * hard-coding a number nobody has checked.
		 */
		countsVerified: z.boolean().default(false),
		exam: z.strictObject({
			scoredItems: z.number().int().positive().nullable(),
			unscoredItems: z.number().int().nonnegative().nullable(),
			minutes: z.number().int().positive().nullable()
		}),
		totalTasks: z.number().int().positive().nullable(),
		domains: z.array(Domain).min(1),
		review: Review,
		provenance: Provenance
	})
	.check((ctx) => {
		const o = ctx.value;
		const codes = o.domains.flatMap((d) => d.tasks.map((t) => t.code));

		if (new Set(codes).size !== codes.length) {
			ctx.issues.push({
				code: 'custom',
				message: `${o.id}: duplicate task codes`,
				input: o.id
			});
		}

		// Only enforce the total once a human has confirmed it at the primary source.
		if (o.countsVerified && o.totalTasks !== null && codes.length !== o.totalTasks) {
			ctx.issues.push({
				code: 'custom',
				message: `${o.id}: totalTasks is ${o.totalTasks} but ${codes.length} tasks are present`,
				input: o.id
			});
		}

		const pattern = TASK_CODE_PATTERN[o.credential];
		if (pattern) {
			for (const c of codes) {
				if (!pattern.test(c)) {
					ctx.issues.push({
						code: 'custom',
						message: `${o.id}: task code "${c}" is not valid for ${o.credential}`,
						input: c
					});
				}
			}
		}

		for (const d of o.domains) {
			for (const t of d.tasks) {
				if (!t.code.startsWith(d.letter)) {
					ctx.issues.push({
						code: 'custom',
						message: `${o.id}: domain ${d.letter} contains foreign task code "${t.code}"`,
						input: t.code
					});
				}
			}
		}

		const weights = o.domains.map((d) => d.examWeightPercent);
		if (weights.every((w): w is number => w !== null)) {
			const sum = weights.reduce((a, b) => a + b, 0);
			if (Math.abs(sum - 100) > 0.01) {
				ctx.issues.push({
					code: 'custom',
					message: `${o.id}: exam weights sum to ${sum}, expected 100`,
					input: o.id
				});
			}
		}

		if (new Set(o.domains.map((d) => d.letter)).size !== o.domains.length) {
			ctx.issues.push({
				code: 'custom',
				message: `${o.id}: duplicate domain letters`,
				input: o.id
			});
		}
	});
export type ContentOutline = z.infer<typeof ContentOutline>;

/** A pointer from a content item to a credential's task code. */
export const TaskRef = z.strictObject({
	credential: Credential,
	code: z.string().min(2).max(8)
});
export type TaskRef = z.infer<typeof TaskRef>;
