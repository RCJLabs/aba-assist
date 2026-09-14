import { z } from 'zod';
import { strictContent } from './guards.js';
import { Citations } from './source.js';
import { Attestation, Credential, Provenance, Review, Slug } from './primitives.js';
import { TaskRef } from './taxonomy.js';

const Option = z.strictObject({
	id: z.enum(['a', 'b', 'c', 'd', 'e']),
	text: z.string().min(1).max(300),
	isCorrect: z.boolean(),
	/**
	 * Required on every option, including wrong ones. Distractor rationales are the
	 * entire pedagogical value of a question bank, and unexplained or wrong rationales
	 * are the single most-cited complaint about the existing apps in this space.
	 */
	rationale: z.string().min(20).max(400)
});

export const QuizQuestion = strictContent({
	id: Slug,
	credential: Credential,
	taskRef: TaskRef,
	secondaryTaskRefs: z.array(TaskRef).max(3).default([]),
	type: z.enum(['single-best-answer', 'multi-select', 'scenario-vignette']),
	stem: z.string().min(20).max(1000),
	/** Renders as a callout. Checked against the stem so the flag cannot drift. */
	negated: z.boolean().default(false),
	options: z.array(Option).min(3).max(5),
	explanation: z.string().min(40).max(1200),
	cognitiveLevel: z.enum(['recall', 'application', 'analysis']),
	difficulty: z.number().int().min(1).max(5),
	termRefs: z.array(Slug).default([]),
	ethicsRefs: z.array(Slug).default([]),
	citations: Citations,
	attestation: Attestation,
	review: Review,
	provenance: Provenance
}).check((ctx) => {
	const q = ctx.value;

	const correct = q.options.filter((o) => o.isCorrect).length;
	const ok = q.type === 'multi-select' ? correct >= 2 : correct === 1;
	if (!ok) {
		ctx.issues.push({
			code: 'custom',
			message: `${q.id}: ${correct} correct option(s) for type "${q.type}"`,
			input: q.id
		});
	}

	if (new Set(q.options.map((o) => o.id)).size !== q.options.length) {
		ctx.issues.push({ code: 'custom', message: `${q.id}: duplicate option ids`, input: q.id });
	}

	for (const o of q.options) {
		if (/^(all|none) of the above/i.test(o.text)) {
			ctx.issues.push({
				code: 'custom',
				message: `${q.id}: "all/none of the above" options are not allowed`,
				input: q.id
			});
		}
	}

	const stemIsNegated = /\b(NOT|EXCEPT|LEAST)\b/.test(q.stem);
	if (stemIsNegated !== q.negated) {
		ctx.issues.push({
			code: 'custom',
			message: `${q.id}: negated flag (${q.negated}) does not match the stem`,
			input: q.id
		});
	}

	// A stem that contains an option verbatim gives the answer away.
	for (const o of q.options) {
		if (o.text.length > 12 && q.stem.toLowerCase().includes(o.text.toLowerCase())) {
			ctx.issues.push({
				code: 'custom',
				message: `${q.id}: option "${o.id}" appears verbatim in the stem`,
				input: q.id
			});
		}
	}
});
export type QuizQuestion = z.infer<typeof QuizQuestion>;

export const QuizFile = z.strictObject({
	questions: z.array(QuizQuestion).min(1)
});
