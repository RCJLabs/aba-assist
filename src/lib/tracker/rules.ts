/**
 * The arithmetic behind the tracker: is this month's supervision enough, and is this
 * cycle's professional development on track.
 *
 * Pure functions over plain data, deliberately separate from both storage and the UI.
 * These numbers decide whether somebody believes their certification is in good standing,
 * so they need to be testable in isolation and readable by a person checking them against
 * a handbook — not buried in a component.
 *
 * Every threshold arrives as an argument. Nothing here knows that the technician figure
 * is 5%: that comes from the credential content, where a reviewer checked it against the
 * handbook, so there is one copy of each number rather than two that drift.
 */
import type {
	Cycle,
	DevelopmentUnit,
	ServiceMonth,
	SupervisionEntry,
	UnitTopic
} from '$lib/db/index.js';

export interface SupervisionRequirement {
	monthlyPercent: number;
	contactsPerMonth: number;
	observedContactsPerMonth: number;
	individualContactsPerMonth: number;
	groupMax: number;
	locator: string;
}

export interface DevelopmentRequirement {
	unitLabel: string;
	cycleYears: number;
	unitsPerCycle: number;
	ethicsUnits: number | null;
	supervisionUnits: number | null;
	supervisionUnitsOnlyIfSupervising: boolean;
	carryOver: boolean;
	effectiveFrom: string | null;
	locator: string;
}

/**
 * One rule, and whether this month or cycle satisfies it.
 *
 * `met: null` means unknowable rather than failed — the service hours for the month have
 * not been entered, so the percentage has no denominator. Reporting that as a failure
 * would train people to ignore the failures that are real.
 */
export interface Check {
	id: string;
	label: string;
	met: boolean | null;
	detail: string;
}

export type Standing = 'met' | 'short' | 'unknown';

export interface MonthSummary {
	/** YYYY-MM. */
	month: string;
	workplaceId: string;
	serviceHours: number | null;
	requiredHours: number | null;
	supervisedHours: number;
	contacts: number;
	observedContacts: number;
	individualContacts: number;
	/** Contacts logged in a group larger than the rule allows, which do not count. */
	oversizedGroups: number;
	checks: Check[];
	standing: Standing;
}

/** Hours, to one decimal, without the floating-point tail. */
function hours(minutes: number): number {
	return Math.round((minutes / 60) * 100) / 100;
}

function round(n: number, places = 2): number {
	const f = 10 ** places;
	return Math.round(n * f) / f;
}

/** Floating-point slack, so 0.30000000000000004 hours still counts as 0.3. */
const EPSILON = 1e-9;

/**
 * Today as YYYY-MM-DD in the reader's own timezone, which is the one their deadline is in.
 *
 * Here rather than in the state module because it is a pure function of the clock, and
 * because `$state` files may not hold a mutable `Date`.
 */
export function todayIso(): string {
	const now = new Date();
	const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 10);
}

export function monthOf(date: string): string {
	return date.slice(0, 7);
}

/**
 * Summarise one calendar month at one workplace.
 *
 * Per workplace because the rule is written per workplace: somebody working at two
 * organisations owes 5% at each, and adding the two together would let a well-supervised
 * job paper over a badly supervised one.
 */
export function summariseMonth(
	month: string,
	workplaceId: string,
	entries: SupervisionEntry[],
	serviceMonth: ServiceMonth | undefined,
	req: SupervisionRequirement
): MonthSummary {
	const mine = entries.filter(
		(e) => e.workplaceId === workplaceId && monthOf(e.date) === month
	);

	const supervisedHours = round(hours(mine.reduce((sum, e) => sum + e.minutes, 0)));
	const contacts = mine.length;
	const observedContacts = mine.filter((e) => e.observed).length;
	const individualContacts = mine.filter((e) => e.format === 'individual').length;
	const serviceHours = serviceMonth ? serviceMonth.hours : null;
	const requiredHours =
		serviceHours === null ? null : round((serviceHours * req.monthlyPercent) / 100);

	const checks: Check[] = [
		{
			id: 'percent',
			label: `${req.monthlyPercent}% of service hours`,
			met: requiredHours === null ? null : supervisedHours + EPSILON >= requiredHours,
			detail:
				requiredHours === null
					? 'Enter the hours you delivered this month to work this out.'
					: `${supervisedHours} of ${requiredHours} hours needed, on ${serviceHours} hours delivered.`
		},
		{
			id: 'contacts',
			label: `${req.contactsPerMonth} real-time contacts`,
			met: contacts >= req.contactsPerMonth,
			detail: `${contacts} logged.`
		},
		{
			id: 'observed',
			label: `${req.observedContactsPerMonth} with client observation`,
			met: observedContacts >= req.observedContactsPerMonth,
			detail: `${observedContacts} logged.`
		},
		{
			id: 'individual',
			label: `${req.individualContactsPerMonth} one-to-one`,
			met: individualContacts >= req.individualContactsPerMonth,
			detail: `${individualContacts} logged.`
		}
	];

	return {
		month,
		workplaceId,
		serviceHours,
		requiredHours,
		supervisedHours,
		contacts,
		observedContacts,
		individualContacts,
		// Group size is recorded as a format rather than a headcount, so this is always 0
		// today. The field exists because the rule has a ceiling and a future version that
		// records headcount should have somewhere to report it.
		oversizedGroups: 0,
		checks,
		standing: standingOf(checks)
	};
}

function standingOf(checks: Check[]): Standing {
	if (checks.some((c) => c.met === false)) return 'short';
	if (checks.some((c) => c.met === null)) return 'unknown';
	return 'met';
}

/** Every month that has either a contact or an hours entry, newest first. */
export function summariseMonths(
	entries: SupervisionEntry[],
	serviceMonths: ServiceMonth[],
	req: SupervisionRequirement
): MonthSummary[] {
	const keys = new Set<string>();
	for (const e of entries) keys.add(`${e.workplaceId}:${monthOf(e.date)}`);
	for (const m of serviceMonths) keys.add(`${m.workplaceId}:${m.month}`);

	const byId = new Map(serviceMonths.map((m) => [`${m.workplaceId}:${m.month}`, m]));
	return [...keys]
		.map((key) => {
			const idx = key.lastIndexOf(':');
			const workplaceId = key.slice(0, idx);
			const month = key.slice(idx + 1);
			return summariseMonth(month, workplaceId, entries, byId.get(key), req);
		})
		.sort(
			(a, b) => b.month.localeCompare(a.month) || a.workplaceId.localeCompare(b.workplaceId)
		);
}

// ------------------------------------------------------------------- cycles

export interface CycleSummary {
	cycleId: string;
	unitLabel: string;
	earned: number;
	required: number;
	byTopic: Record<UnitTopic, number>;
	checks: Check[];
	/** Negative once the cycle has ended. */
	daysRemaining: number;
	/** Units still needed, and how many days are left to earn them in. */
	remaining: number;
	/**
	 * False where the requirement starts after this cycle ends.
	 *
	 * The ledger still records what was earned; nothing is scored against a total that
	 * does not apply yet, and `remaining` is zero rather than a debt nobody owes.
	 */
	requirementApplies: boolean;
	standing: Standing;
	expired: boolean;
}

/** Whole days from `from` to `to`, both YYYY-MM-DD, using UTC so no timezone shifts it. */
export function daysBetween(from: string, to: string): number {
	const a = Date.parse(`${from}T00:00:00Z`);
	const b = Date.parse(`${to}T00:00:00Z`);
	return Math.round((b - a) / 86_400_000);
}

/**
 * The last day of a cycle that starts on `startDate` and runs `years` years.
 *
 * A two-year cycle beginning 1 January 2027 ends on 31 December 2028, not 1 January 2029:
 * the anniversary is the day the next cycle starts. Off by one here is a day somebody
 * thinks they still have.
 */
export function cycleEnd(startDate: string, years: number): string {
	const d = new Date(`${startDate}T00:00:00Z`);
	d.setUTCFullYear(d.getUTCFullYear() + years);
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

export function summariseCycle(
	cycle: Cycle,
	units: DevelopmentUnit[],
	req: DevelopmentRequirement,
	today: string
): CycleSummary {
	const mine = units.filter((u) => u.cycleId === cycle.id);
	const byTopic: Record<UnitTopic, number> = { general: 0, ethics: 0, supervision: 0 };
	for (const u of mine) byTopic[u.topic] = round(byTopic[u.topic] + u.units);
	const earned = round(mine.reduce((sum, u) => sum + u.units, 0));

	/*
	 * A requirement that has not started yet is not a requirement this cycle failed.
	 *
	 * The technician unit rule is the live case: the credential content records it as
	 * applying from 2027, because anyone recertifying during 2026 meets the older annual
	 * requirements one last time. Scoring every cycle against the new total regardless of
	 * date told those readers they owed twelve units they do not owe — during exactly the
	 * transition the content flags, to the largest group of people using this.
	 *
	 * The test is the cycle's end date, because the requirement attaches to the
	 * recertification it leads to. A cycle that ends before the rule starts is recorded
	 * and not scored, which is the same posture the tools take for a credential whose
	 * requirements have not been read: keep the ledger, withhold the verdict.
	 */
	const applies = req.effectiveFrom === null || cycle.endDate >= req.effectiveFrom;

	const checks: Check[] = applies
		? [
				{
					id: 'total',
					label: `${req.unitsPerCycle} ${req.unitLabel}s`,
					met: earned + EPSILON >= req.unitsPerCycle,
					detail: `${earned} of ${req.unitsPerCycle} earned.`
				}
			]
		: [
				{
					id: 'total',
					label: `${req.unitsPerCycle} ${req.unitLabel}s`,
					met: null,
					detail:
						`This requirement applies to cycles ending on or after ${req.effectiveFrom}. ` +
						`This one ends ${cycle.endDate}, so the ${earned} recorded here are kept but not scored. ` +
						`Check your handbook for what this cycle has to meet.`
				}
			];

	if (applies && req.ethicsUnits !== null) {
		checks.push({
			id: 'ethics',
			label: `${req.ethicsUnits} on ethics`,
			met: byTopic.ethics + EPSILON >= req.ethicsUnits,
			detail: `${byTopic.ethics} of ${req.ethicsUnits} earned.`
		});
	}

	if (applies && req.supervisionUnits !== null) {
		// The analyst supervision minimum applies only to a cycle in which they supervised
		// somebody, which is a question only the user can answer — so it is a flag on the
		// cycle rather than something inferred from the supervision log, which may well be
		// empty because they tracked it elsewhere.
		const applies = !req.supervisionUnitsOnlyIfSupervising || cycle.supervisedOthers;
		checks.push({
			id: 'supervision',
			label: `${req.supervisionUnits} on supervision`,
			met: applies ? byTopic.supervision + EPSILON >= req.supervisionUnits : true,
			detail: applies
				? `${byTopic.supervision} of ${req.supervisionUnits} earned.`
				: 'Not required: this cycle is marked as one where you supervised nobody.'
		});
	}

	const daysRemaining = daysBetween(today, cycle.endDate);
	return {
		cycleId: cycle.id,
		unitLabel: req.unitLabel,
		earned,
		required: req.unitsPerCycle,
		byTopic,
		checks,
		daysRemaining,
		requirementApplies: applies,
		remaining: applies ? round(Math.max(0, req.unitsPerCycle - earned)) : 0,
		standing: standingOf(checks),
		expired: daysRemaining < 0
	};
}

/**
 * Units earned outside the cycle they are filed under.
 *
 * Nothing carries forward at any BACB credential, so a unit dated outside its cycle is
 * not a rounding problem — it is one that will not count, and the reader would rather
 * find out now than at recertification.
 */
export function unitsOutsideCycle(cycle: Cycle, units: DevelopmentUnit[]): DevelopmentUnit[] {
	return units.filter(
		(u) => u.cycleId === cycle.id && (u.date < cycle.startDate || u.date > cycle.endDate)
	);
}
