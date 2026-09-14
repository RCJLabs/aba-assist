import { z } from 'zod';
import { strictContent } from './guards.js';
import { Citations } from './source.js';
import { Attestation, Provenance, Review, Setting, Slug } from './primitives.js';
import { TaskRef } from './taxonomy.js';

export const TermCategory = z.enum([
	'philosophy',
	'principles',
	'measurement',
	'graphing',
	'assessment',
	'acquisition',
	'reduction',
	'verbal-behavior',
	'ethics',
	'supervision',
	'documentation',
	'research-design'
]);
export type TermCategory = z.infer<typeof TermCategory>;

const Example = z.strictObject({
	text: z.string().min(15).max(400),
	setting: Setting.default('any'),
	why: z.string().max(300).optional()
});

export const Term = strictContent({
	id: Slug,
	term: z.string().min(1).max(80),
	aliases: z.array(z.string()).default([]),
	abbreviation: z.string().max(12).nullable().default(null),
	category: TermCategory,

	definition: z.strictObject({
		/** Precise, field-standard language — our words, not a source's. */
		technical: z.string().min(40).max(700),
		/** Powers the plain-language toggle. Readability is checked at build time. */
		plain: z.string().min(20).max(400),
		/** <=90 chars. Ships in the lightweight search index and result rows. */
		gloss: z.string().min(10).max(90)
	}),

	/**
	 * Examples are the most copyright-fraught part of a glossary and also the most
	 * pedagogically valuable, so writing our own is a win twice over. At least one of
	 * each is required.
	 */
	examples: z.array(Example).min(1).max(4),
	nonExamples: z.array(Example).min(1).max(4),

	/** Commonly-confused pairs. Validated as symmetric. */
	contrastWith: z.array(Slug).default([]),
	seeAlso: z.array(Slug).default([]),
	taskRefs: z.array(TaskRef).default([]),
	ethicsRefs: z.array(Slug).default([]),

	searchBoost: z.number().min(0.5).max(3).default(1),

	flashcard: z
		.strictObject({
			enabled: z.boolean().default(true),
			/** null => use `term` */
			front: z.string().max(160).nullable().default(null),
			/** null => use `definition.plain` */
			back: z.string().max(400).nullable().default(null),
			mnemonic: z.string().max(200).nullable().default(null)
		})
		.default({ enabled: true, front: null, back: null, mnemonic: null }),

	citations: Citations,
	attestation: Attestation,
	review: Review,
	provenance: Provenance
});
export type Term = z.infer<typeof Term>;
