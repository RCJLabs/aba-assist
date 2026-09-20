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
	SuperviseeMonth,
	SupervisionEntry,
	UnitTopic
} from '$lib/db/index.js';

export interface SupervisionRequirement {
	monthlyPercent: number;
	/** The lower tier and where it starts, where a credential steps its requirement down. */
	reducedPercent?: number | null;
	reducedAfterServiceHours?: number | null;
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

/** A month judged from the supervisor's side: the same shape, plus whose month it is. */
export interface SuperviseeMonthSummary extends MonthSummary {
	superviseeId: string;
}

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
 *
 * **Received only.** One store holds both directions — a contact with `superviseeId: null`
 * is supervision this reader was given, and one with a supervisee is supervision they
 * provided — and this counts only the first. Pooling them was a real defect rather than a
 * tidiness question: an assistant analyst who supervises two technicians at the same
 * organisation had their own hours padded by the supervision they *delivered*, and the
 * page told them they had met a requirement they had not. The supervisor's side of the
 * same log is `summariseSuperviseeMonth`.
 */
export function summariseMonth(
	month: string,
	workplaceId: string,
	entries: SupervisionEntry[],
	serviceMonth: ServiceMonth | undefined,
	req: SupervisionRequirement
): MonthSummary {
	const mine = entries.filter(
		(e) =>
			e.superviseeId === null && e.workplaceId === workplaceId && monthOf(e.date) === month
	);

	return {
		...summariseContacts(mine, serviceMonth ? serviceMonth.hours : null, req),
		month,
		workplaceId
	};
}

/**
 * The rule itself, over whichever contacts count and whatever hours they are measured
 * against.
 *
 * Shared by both directions rather than written twice. Two copies of a compliance
 * calculation drift, and the one that drifts is whichever is read less often — which
 * here would be the supervisor's, the side nobody has been testing.
 */
function summariseContacts(
	mine: SupervisionEntry[],
	serviceHours: number | null,
	req: SupervisionRequirement
): Omit<MonthSummary, 'month' | 'workplaceId'> {
	const supervisedHours = round(hours(mine.reduce((sum, e) => sum + e.minutes, 0)));
	const contacts = mine.length;
	const observedContacts = mine.filter((e) => e.observed).length;
	const individualContacts = mine.filter((e) => e.format === 'individual').length;
	const requiredHours =
		serviceHours === null ? null : round((serviceHours * req.monthlyPercent) / 100);

	/*
	 * A requirement with a tier is one this app cannot judge.
	 *
	 * The assistant-analyst percentage steps down from 5% to 2% after the first 1,000
	 * hours of post-certification practice, and nothing in here knows how many hours
	 * somebody has accrued across their whole career — the log starts when they install
	 * the app. Picking the stricter tier would tell an experienced assistant they were
	 * short when they were not; picking the looser one would tell a new one they were
	 * fine when they were not. So the hours are reported and the verdict withheld, which
	 * is the same answer this engine already gives a month with no denominator.
	 */
	const tiered = req.reducedPercent !== null && req.reducedPercent !== undefined;

	const checks: Check[] = [
		{
			id: 'percent',
			label: tiered
				? `${req.monthlyPercent}% of service hours, or ${req.reducedPercent}% later on`
				: `${req.monthlyPercent}% of service hours`,
			met:
				requiredHours === null || tiered ? null : supervisedHours + EPSILON >= requiredHours,
			detail:
				requiredHours === null
					? 'Enter the hours you delivered this month to work this out.'
					: tiered
						? `${supervisedHours} supervised on ${serviceHours} hours delivered. ` +
							`Which percentage you owe depends on whether you have passed ${req.reducedAfterServiceHours} hours ` +
							`of post-certification practice, which this app does not know — check your handbook.`
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
	// Received contacts only, to match what `summariseMonth` counts. A month whose only
	// activity was supervision this reader *gave* is not a month of theirs to report on,
	// and listing it with four failed checks would be an accusation rather than a record.
	for (const e of entries) {
		if (e.superviseeId === null) keys.add(`${e.workplaceId}:${monthOf(e.date)}`);
	}
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

// ------------------------------------------------------- the other direction

/**
 * One supervisee's month, judged against the same rule from the supervisor's side.
 *
 * Everything under `/tools` until now has been first-person: your fieldwork, the
 * supervision you received, your development units. A behaviour analyst supervising four
 * technicians had nothing, which is a strange gap given that they are the person the
 * requirement is written *at* — the technician has to receive the supervision, but the
 * analyst is the one who has to be able to show it was delivered.
 *
 * It is the same rule and the same arithmetic. What differs is the denominator: the
 * percentage is owed on the *supervisee's* service hours, not the supervisor's, and those
 * have to be recorded separately because nothing else in this app knows them.
 *
 * Keyed by workplace as well, for the reason `summariseMonth` already gives: the rule is
 * written per organisation, and a technician supervised well at one job and badly at
 * another has not met it twice over.
 */
export function summariseSuperviseeMonth(
	month: string,
	superviseeId: string,
	workplaceId: string,
	entries: SupervisionEntry[],
	superviseeMonth: SuperviseeMonth | undefined,
	req: SupervisionRequirement
): SuperviseeMonthSummary {
	const given = entries.filter(
		(e) =>
			e.superviseeId === superviseeId &&
			e.workplaceId === workplaceId &&
			monthOf(e.date) === month
	);

	const base = summariseContacts(given, superviseeMonth ? superviseeMonth.hours : null, req);
	return { ...base, month, workplaceId, superviseeId };
}

/** Every supervisee-month with either a contact or an hours entry, newest first. */
export function summariseSuperviseeMonths(
	entries: SupervisionEntry[],
	superviseeMonths: SuperviseeMonth[],
	req: SupervisionRequirement
): SuperviseeMonthSummary[] {
	const keys = new Set<string>();
	for (const e of entries) {
		if (e.superviseeId !== null) {
			keys.add(`${e.superviseeId}|${e.workplaceId}|${monthOf(e.date)}`);
		}
	}
	for (const m of superviseeMonths) keys.add(`${m.superviseeId}|${m.workplaceId}|${m.month}`);

	// A pipe rather than a colon, because ids are generated and a colon in one would make
	// the key ambiguous where three parts have to come back out of it.
	const byId = new Map(
		superviseeMonths.map((m) => [`${m.superviseeId}|${m.workplaceId}|${m.month}`, m])
	);
	return [...keys]
		.map((key) => {
			const [superviseeId, workplaceId, month] = key.split('|') as [string, string, string];
			return summariseSuperviseeMonth(
				month,
				superviseeId,
				workplaceId,
				entries,
				byId.get(key),
				req
			);
		})
		.sort(
			(a, b) =>
				b.month.localeCompare(a.month) ||
				a.superviseeId.localeCompare(b.superviseeId) ||
				a.workplaceId.localeCompare(b.workplaceId)
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
