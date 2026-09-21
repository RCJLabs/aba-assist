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
	/**
	 * The lower percentage that applies once enough practice has been accrued, where a
	 * credential steps its requirement down, and the hours at which the step happens.
	 *
	 * The assistant-analyst rule is the case this exists for: 5% of service hours for the
	 * first 1,000 hours of post-certification practice, 2% after that. Flattening it to a
	 * single number would make the app tell an experienced assistant they were short when
	 * they were not, which is the failure this project treats as worse than saying nothing.
	 *
	 * Both are null where the requirement is flat, which is the ordinary case.
	 */
	reducedPercent: z.number().min(0).max(100).nullable().default(null),
	reducedAfterServiceHours: z.number().int().min(1).nullable().default(null),
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

/**
 * One set of fieldwork rules. There are two live at once: the requirements in force now
 * and the ones that replace them, which a trainee starting today may well be verified
 * under. Getting that wrong costs somebody months, so both are modelled rather than
 * averaged into one.
 */
const FieldworkRuleset = z.strictObject({
	id: z.enum(['current', '2027']),
	label: z.string().min(4).max(60),
	/** When this set starts applying, where a source states it. */
	effectiveFrom: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.nullable()
		.default(null),
	monthlyMinHours: z.number().min(0),
	monthlyMaxHours: z.number().min(1),
	/** Percent of the month's fieldwork hours that must be supervised. */
	supervisedPercent: z.number().min(0).max(100),
	concentratedPercent: z.number().min(0).max(100),
	supervisedContacts: z.number().int().min(0),
	concentratedContacts: z.number().int().min(0),
	/**
	 * Cumulative observation minutes required per month, or null where the rule is
	 * instead "at least one observation with a client" and a count is what matters.
	 */
	observationMinutes: z.number().min(0).nullable().default(null),
	concentratedObservationMinutes: z.number().min(0).nullable().default(null),
	locator: z.string().max(160)
});

/**
 * A ratio the handbook states without settling whether it is checked in each calendar
 * month or across the whole fieldwork experience.
 *
 * That difference decides whether a light month is a failed month, which is exactly the
 * kind of thing this app must not guess at: reporting a month as lost when it was not
 * would send somebody to argue with a supervisor over nothing. While `scopeVerified` is
 * false the app shows the figure and withholds the verdict — the same posture that kept
 * ethics standard numbers out of the build until the documents arrived.
 */
const FieldworkRatio = z.strictObject({
	id: z.enum(['individual-supervision', 'unrestricted']),
	label: z.string().min(4).max(80),
	percent: z.number().min(0).max(100),
	/** What the percentage is taken of, in our words. */
	of: z.string().min(4).max(80),
	scopeVerified: z.boolean().default(false),
	scope: z.enum(['month', 'total']).nullable().default(null),
	locator: z.string().max(160)
});

/**
 * What has to be true of the person supervising, and what has to exist before hours start.
 *
 * Modelled as a checklist in content rather than as rules in code, because the app cannot
 * verify any of it. Nothing here is checkable from a trainee's log: whether somebody holds
 * an active certification, has held it a year, and is current on their supervision
 * continuing education are facts about another person, held on a registry this app cannot
 * reach and must not cache. What the app can do is ask, record the answer with the date it
 * was given, and put it in the record where an auditor would look for it.
 *
 * Each item carries an id so a trainee's confirmation survives the wording being improved.
 * Drive the checklist from here and a handbook revision is a content edit; hard-code it and
 * it is a release.
 */
const SupervisorRequirements = z.strictObject({
	items: z
		.array(
			z.strictObject({
				id: z
					.string()
					.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a kebab-case slug')
					.max(40),
				label: z.string().min(10).max(200)
			})
		)
		.min(1),
	/**
	 * Whether a signed supervision contract has to exist before hours accrue. The one part
	 * of this the app can actually check, because a contract has a date and so does a month.
	 */
	contractRequired: z.boolean().default(true),
	locator: z.string().max(160)
});

const FieldworkRequirement = z.strictObject({
	/** Credited hours needed, where concentrated hours count for more. */
	totalHours: z.number().positive(),
	concentratedTotalHours: z.number().positive(),
	/** What one concentrated hour is worth against `totalHours`. */
	concentratedMultiplier: z.number().min(1),
	/** Everything must be finished inside this many continuous years. */
	windowYears: z.number().int().min(1),
	rulesets: z.array(FieldworkRuleset).min(1),
	ratios: z.array(FieldworkRatio).default([]),
	/** Activities that do not count, in our words, for the reminder on the log. */
	excluded: z.array(z.string().min(4)).default([]),
	/**
	 * Where the handbook sets out what has to be kept and signed.
	 *
	 * Its own reference rather than reusing `locator`, because the hour requirements and
	 * the documentation requirements are different pages and the exported record cites the
	 * page each figure came from. A signature row carrying the hours page would be a
	 * citation that does not check out, which is worse in an auditable record than no
	 * citation at all.
	 */
	documentationLocator: z.string().max(160),
	/** Who may supervise, and what must be signed before any of this counts. */
	supervisor: SupervisorRequirements,
	locator: z.string().max(160)
});

export const MaintenanceRequirements = z.strictObject({
	supervision: SupervisionRequirement.nullable().default(null),
	development: DevelopmentRequirement.nullable().default(null),
	fieldwork: FieldworkRequirement.nullable().default(null)
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
	requirements: MaintenanceRequirements.default({
		supervision: null,
		development: null,
		fieldwork: null
	}),
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
	/*
	 * The flag and the data have to agree in both directions, as everywhere else: a ratio
	 * claiming a verified scope must name one, and one that names a scope must not also
	 * claim the scope is unknown.
	 */
	for (const ratio of ctx.value.requirements.fieldwork?.ratios ?? []) {
		if (ratio.scopeVerified && ratio.scope === null) {
			ctx.issues.push({
				code: 'custom',
				message: `${ctx.value.id}: fieldwork ratio "${ratio.id}" says its scope is verified but names none`,
				input: ctx.value.id
			});
		}
		if (!ratio.scopeVerified && ratio.scope !== null) {
			ctx.issues.push({
				code: 'custom',
				message: `${ctx.value.id}: fieldwork ratio "${ratio.id}" names a scope while saying it is unverified`,
				input: ctx.value.id
			});
		}
	}

	/*
	 * The three hour figures have to describe the same requirement.
	 *
	 * The multiplier is the ratio between the two routes, published rounded — 1500 at 1.33
	 * comes to 1995 rather than 2000, which is the rounding and not an error. So this
	 * checks that the three agree to within a percent, which still catches a mistyped
	 * total or a multiplier from the wrong credential.
	 */
	const fw = ctx.value.requirements.fieldwork;
	if (fw) {
		const implied = fw.totalHours / fw.concentratedTotalHours;
		if (Math.abs(fw.concentratedMultiplier - implied) > 0.01) {
			ctx.issues.push({
				code: 'custom',
				message: `${ctx.value.id}: a ${fw.concentratedMultiplier}x multiplier does not reconcile ${fw.concentratedTotalHours} concentrated hours with ${fw.totalHours} total (implies ${implied.toFixed(3)})`,
				input: ctx.value.id
			});
		}
	}

	const sup = ctx.value.requirements.supervision;
	if (sup) {
		/*
		 * The two tiered fields describe one rule and are meaningless apart: a reduced
		 * percentage with no threshold cannot be applied, and a threshold with no reduced
		 * percentage says a step happens without saying to what. Requiring them together
		 * also lets a reader of one conclude something about the other.
		 */
		if ((sup.reducedPercent === null) !== (sup.reducedAfterServiceHours === null)) {
			ctx.issues.push({
				code: 'custom',
				message: `${ctx.value.id}: a tiered supervision requirement needs both the reduced percentage and the service hours it starts at`,
				input: ctx.value.id
			});
		}
		if (sup.reducedPercent !== null && sup.reducedPercent > sup.monthlyPercent) {
			ctx.issues.push({
				code: 'custom',
				message: `${ctx.value.id}: the reduced supervision percentage (${sup.reducedPercent}) is above the ordinary one (${sup.monthlyPercent})`,
				input: ctx.value.id
			});
		}
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
