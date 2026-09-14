import { z } from 'zod';
import { strictContent } from './guards.js';
import { Credential, Provenance, Review, Slug } from './primitives.js';

/**
 * Certification facts for one credential: eligibility, the exam, maintenance.
 *
 * Everything here is a FACT drawn from the credential handbook — hour counts, fees,
 * cycle lengths, deadlines — restated in our own words with a pointer to the handbook.
 * The handbook's own text is never reproduced (see OfficialTextGuard), and every item
 * names the handbook version it was checked against, because these numbers change and a
 * stale "12 PDUs" is worse than none.
 */
const FactItem = z.strictObject({
	label: z.string().min(2).max(80),
	value: z.string().min(1).max(400),
	/** Where in the handbook this was checked, e.g. "Recertification, p. 30". */
	locator: z.string().max(120).optional()
});

const FactSection = z.strictObject({
	id: Slug,
	title: z.string().min(3).max(80),
	ourNote: z.string().max(600).optional(),
	items: z.array(FactItem).min(1)
});

export const CredentialFacts = strictContent({
	id: Slug,
	credential: Credential,
	label: z.string().min(3).max(80),
	issuer: z.enum(['BACB', 'QABA']),
	handbookSourceId: Slug,
	/** The handbook's own version stamp, e.g. "06/2026". */
	handbookVersion: z.string().min(3).max(40),
	/** Content outline this credential is examined against, if one is modelled. */
	outlineId: Slug.nullable().default(null),
	ourOverview: z.string().min(40).max(700),
	sections: z.array(FactSection).min(1),
	review: Review,
	provenance: Provenance
}).check((ctx) => {
	if (ctx.value.officialUrl === null) {
		ctx.issues.push({
			code: 'custom',
			message: `${ctx.value.id}: credential facts must link to the official handbook`,
			input: ctx.value.id
		});
	}
	const ids = ctx.value.sections.map((s) => s.id);
	if (new Set(ids).size !== ids.length) {
		ctx.issues.push({
			code: 'custom',
			message: `${ctx.value.id}: duplicate section ids`,
			input: ctx.value.id
		});
	}
});
export type CredentialFacts = z.infer<typeof CredentialFacts>;
