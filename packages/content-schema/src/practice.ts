import { z } from 'zod';
import { strictContent } from './guards.js';
import { Citations } from './source.js';
import { Attestation, Credential, Provenance, Review, Slug } from './primitives.js';
import { TaskRef } from './taxonomy.js';

/**
 * Practice guides: the two documentation aids the research said to build.
 *
 * These sit deliberately apart from scenarios. A scenario answers "what do I do"; a
 * practice guide answers "how do I write this down", which is a much narrower question
 * and a much safer one — nothing here touches a clinical decision, and nothing here is
 * about a particular person.
 *
 * Both members are `z.strictObject`, and the discriminant decides which fields exist at
 * all, so a phrasing pair cannot appear in a checklist by accident.
 */

/**
 * One thing a session note is expected to carry.
 *
 * `why` is the point of the whole feature. A list of field names is a form; a list of
 * field names with the reason each one exists is the thing that improves a note.
 */
const ChecklistItem = z.strictObject({
	id: Slug,
	label: z.string().min(4).max(90),
	why: z.string().min(30).max(400),
	/** An illustrative fragment, written by us, never drawn from a real note. */
	example: z.string().min(10).max(300).nullable().default(null),
	/**
	 * True where the element is near-universal, false where it is common but decided by an
	 * employer or a funder. The app has no way to know one reader's requirements, so the
	 * distinction is carried in the data rather than flattened into a single list.
	 */
	usuallyRequired: z.boolean().default(true)
});

/**
 * A subjective phrase and an objective rewrite of it.
 *
 * Both are ours. A real note would be client data, and a real note is exactly what must
 * never be in this repository.
 */
const PhrasingPair = z.strictObject({
	id: Slug,
	/** What people actually write. */
	vague: z.string().min(5).max(200),
	/** The same observation, in terms another person could measure. */
	objective: z.string().min(15).max(400),
	why: z.string().min(20).max(400)
});

const PracticeGuideBase = {
	id: Slug,
	title: z.string().min(5).max(90),
	gloss: z.string().min(10).max(140),
	audience: z.array(Credential).min(1),
	ourSummary: z.string().min(80).max(1200),
	plainSummary: z.string().min(40).max(500),
	/**
	 * Who actually decides, named on every guide.
	 *
	 * Documentation requirements come from an employer, a funder and a state, not from an
	 * app — and a checklist that implies otherwise is worse than no checklist, because a
	 * reader could satisfy it and still be out of compliance.
	 */
	whoDecides: z.string().min(30).max(400),
	termRefs: z.array(Slug).default([]),
	taskRefs: z.array(TaskRef).default([]),
	citations: Citations,
	attestation: Attestation,
	review: Review,
	provenance: Provenance
};

export const PracticeGuide = z.discriminatedUnion('kind', [
	strictContent({
		...PracticeGuideBase,
		kind: z.literal('checklist'),
		items: z.array(ChecklistItem).min(3)
	}),
	strictContent({
		...PracticeGuideBase,
		kind: z.literal('phrasing'),
		pairs: z.array(PhrasingPair).min(4)
	})
]);
export type PracticeGuide = z.infer<typeof PracticeGuide>;
