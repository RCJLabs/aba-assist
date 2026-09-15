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

/**
 * The same maintenance requirements as the prose above, in numbers a calculator can use.
 *
 * The tracker has to do arithmetic — is 5% of this month's service hours covered, is this
 * cycle's ethics minimum met — and the numbers it uses must be the ones a reviewer
 * checked, not a second copy that drifts. So they live here, beside the prose that states
 * them, carrying the same handbook locator and going through the same review queue.
 *
 * `null` means "this credential has no such requirement", which is different from zero:
 * a technician has no ethics-unit minimum at all, while an analyst who supervised nobody
 * has a supervision minimum of zero units this cycle.
 */
const SupervisionRequirement = z.strictObject({
	/** Percent of service-delivery hours that must be supervised, each calendar month. */
	monthlyPercent: z.number().min(0).max(100),
	/** Minimum real-time contacts per month. */
	contactsPerMonth: z.number().int().min(0),
	/** Of those, how many must include the supervisor observing client work. */
	observedContactsPerMonth: z.number().int().min(0),
	/** Of those, how many must be one-to-one rather than in a group. */
	individualContactsPerMonth: z.number().int().min(0),
	/** Largest group that still counts as supervision. */
	groupMax: z.number().int().min(1),
	locator: z.string().max(120)
});

const DevelopmentRequirement = z.strictObject({
	/** What the units are called for this credential — the label a reader recognises. */
	unitLabel: z.string().min(2).max(40),
	cycleYears: z.number().int().min(1).max(5),
	unitsPerCycle: z.number().min(0),
	/** Minimum units on ethics, or null where the credential sets none. */
	ethicsUnits: z.number().min(0).nullable().default(null),
	/**
	 * Minimum units on supervision, which for analysts applies only to a cycle in which
	 * they supervised anyone. Null where the credential sets none.
	 */
	supervisionUnits: z.number().min(0).nullable().default(null),
	supervisionUnitsOnlyIfSupervising: z.boolean().default(false),
	/** Whether surplus units roll into the next cycle. Every BACB credential: no. */
	carryOver: z.boolean(),
	/** The date this requirement starts applying, where it replaces an older one. */
	effectiveFrom: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.nullable()
		.default(null),
	locator: z.string().max(120)
});

export const MaintenanceRequirements = z.strictObject({
	supervision: SupervisionRequirement.nullable().default(null),
	development: DevelopmentRequirement.nullable().default(null)
});
export type MaintenanceRequirements = z.infer<typeof MaintenanceRequirements>;

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
	/** Machine-readable maintenance rules, for the tracker. */
	requirements: MaintenanceRequirements.default({ supervision: null, development: null }),
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

	// A requirement a reader cannot check is a number this app made up as far as they can
	// tell, and the tracker turns these into a pass or fail on somebody's certification.
	const dev = ctx.value.requirements.development;
	if (dev) {
		for (const [name, units] of [
			['ethicsUnits', dev.ethicsUnits],
			['supervisionUnits', dev.supervisionUnits]
		] as const) {
			if (units !== null && units > dev.unitsPerCycle) {
				ctx.issues.push({
					code: 'custom',
					message: `${ctx.value.id}: ${name} (${units}) exceeds unitsPerCycle (${dev.unitsPerCycle})`,
					input: ctx.value.id
				});
			}
		}
	}
	const sup = ctx.value.requirements.supervision;
	if (sup) {
		for (const [name, n] of [
			['observedContactsPerMonth', sup.observedContactsPerMonth],
			['individualContactsPerMonth', sup.individualContactsPerMonth]
		] as const) {
			if (n > sup.contactsPerMonth) {
				ctx.issues.push({
					code: 'custom',
					message: `${ctx.value.id}: ${name} (${n}) exceeds contactsPerMonth (${sup.contactsPerMonth})`,
					input: ctx.value.id
				});
			}
		}
	}
});
export type CredentialFacts = z.infer<typeof CredentialFacts>;
