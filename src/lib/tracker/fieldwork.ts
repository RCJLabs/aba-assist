/**
 * Whether a month of supervised fieldwork counts, and what it adds up to.
 *
 * This is the most expensive record-keeping in the field to get wrong. Fieldwork is
 * verified one calendar month at a time, and a month that misses a requirement does not
 * shrink — it is gone, and people find out at verification, sometimes a year later. So
 * the useful thing is not a running total, it is a per-month verdict with the reason
 * attached while there is still time to fix it.
 *
 * Every threshold arrives as an argument, from the credential content where a human
 * checked it against the handbook. Nothing here knows that the figure is 5%.
 */
import type { Check, Standing } from './rules.js';

export type FieldworkType = 'supervised' | 'concentrated';

export interface FieldworkRuleset {
	id: 'current' | '2027';
	label: string;
	effectiveFrom: string | null;
	monthlyMinHours: number;
	monthlyMaxHours: number;
	supervisedPercent: number;
	concentratedPercent: number;
	supervisedContacts: number;
	concentratedContacts: number;
	observationMinutes: number | null;
	concentratedObservationMinutes: number | null;
	locator: string;
}

export interface FieldworkRatio {
	id: 'individual-supervision' | 'unrestricted';
	label: string;
	percent: number;
	of: string;
	scopeVerified: boolean;
	scope: 'month' | 'total' | null;
	locator: string;
}

export interface FieldworkRequirement {
	totalHours: number;
	concentratedTotalHours: number;
	concentratedMultiplier: number;
	windowYears: number;
	rulesets: FieldworkRuleset[];
	ratios: FieldworkRatio[];
	excluded: string[];
	/** Where the handbook says what has to be kept and signed, which is a different page. */
	documentationLocator: string;
	locator: string;
}

/** One calendar month as the monthly verification form asks for it. */
export interface FieldworkMonthInput {
	/** YYYY-MM. */
	month: string;
	type: FieldworkType;
	totalHours: number;
	unrestrictedHours: number;
	supervisionHours: number;
	individualSupervisionHours: number;
	contacts: number;
	/** Whether a supervisor observed you with a client at all this month. */
	observedWithClient: boolean;
	/** Cumulative observation minutes, for the ruleset that counts them. */
	observationMinutes: number;
}

/** A figure the app reports without deciding, because the rule's scope is unverified. */
export interface Figure {
	id: string;
	label: string;
	detail: string;
	/** The threshold, for context, and why no verdict is attached. */
	note: string;
}

export interface FieldworkMonthSummary {
	month: string;
	type: FieldworkType;
	checks: Check[];
	figures: Figure[];
	standing: Standing;
	/** Hours this month contributes toward the total, after the multiplier. */
	creditedHours: number;
	/** Why the credit is less than the hours logged, in our words. Null when it is not. */
	creditNote: string | null;
}

const EPSILON = 1e-9;

function round(n: number, places = 2): number {
	const f = 10 ** places;
	return Math.round(n * f) / f;
}

function pct(part: number, whole: number): number {
	return whole === 0 ? 0 : round((100 * part) / whole, 1);
}

export function rulesetById(req: FieldworkRequirement, id: string): FieldworkRuleset {
	return req.rulesets.find((r) => r.id === id) ?? req.rulesets[0]!;
}

/** Hours credited toward the total. Concentrated hours are worth more. */
export function creditedHours(
	m: Pick<FieldworkMonthInput, 'type' | 'totalHours'>,
	req: FieldworkRequirement
): number {
	return round(
		m.type === 'concentrated' ? m.totalHours * req.concentratedMultiplier : m.totalHours
	);
}

/**
 * What a month of fieldwork is actually worth.
 *
 * The handbook does not simply void a month that misses a requirement — it gives a
 * different adjustment for each one, and the differences are large. Missing the
 * observation costs the whole month. Missing half the required contacts costs half the
 * hours. Falling short on the supervision percentage costs only the independent hours
 * above what the percentage supports. Guessing "it all counts" overstates somebody's
 * progress by hundreds of hours; guessing "none of it counts" sends them to redo work
 * they already own.
 *
 * Concentrated fieldwork is the exception the handbook states outright: those hours may
 * not be prorated or adjusted. We read that as covering the three remedies below, so a
 * concentrated month that misses any of them is worth nothing — there is no adjustment
 * available to bring it into compliance. The monthly ceiling still applies, because a cap
 * everyone is subject to is not a remedy for a deficient month. Where those two readings
 * differ we take the lower number: telling somebody they are further along than they are
 * is the error that costs them a year.
 */
function eligibleHours(
	m: FieldworkMonthInput,
	rules: FieldworkRuleset,
	opts: {
		concentrated: boolean;
		observationMet: boolean;
		needPercent: number;
		needContacts: number;
		countableSupervision: number;
	}
): { hours: number; note: string | null } {
	if (!opts.observationMet) {
		return { hours: 0, note: 'No observation with a client, so no hours count this month.' };
	}
	if (m.totalHours + EPSILON < rules.monthlyMinHours) {
		return {
			hours: 0,
			note: `Below the ${rules.monthlyMinHours}-hour floor, so no hours count this month.`
		};
	}

	const capped = Math.min(m.totalHours, rules.monthlyMaxHours);
	const notes: string[] = [];
	if (m.totalHours > rules.monthlyMaxHours + EPSILON) {
		notes.push(`the ${rules.monthlyMaxHours}-hour ceiling`);
	}

	const requiredSupervision = (capped * opts.needPercent) / 100;
	const percentShort = opts.countableSupervision + EPSILON < requiredSupervision;
	const contactsShort = m.contacts < opts.needContacts;
	const groupExcess = m.supervisionHours > opts.countableSupervision + EPSILON;

	if (opts.concentrated && (percentShort || contactsShort || groupExcess)) {
		return {
			hours: 0,
			note: 'Concentrated hours may not be prorated or adjusted, so a month that misses a requirement counts for nothing.'
		};
	}

	/*
	 * Each remedy is stated against the month's own total, so they are worked out
	 * independently and the smallest wins rather than compounding. Two shortfalls are not
	 * twice the penalty; the binding one is the penalty.
	 */
	let hours = capped;
	if (percentShort) {
		hours = Math.min(hours, (opts.countableSupervision * 100) / opts.needPercent);
		notes.push(`the ${opts.needPercent}% supervision minimum`);
	}
	if (contactsShort) {
		hours = Math.min(hours, (capped * m.contacts) / opts.needContacts);
		notes.push(`${m.contacts} of ${opts.needContacts} supervisor contacts`);
	}
	if (groupExcess) {
		notes.push('group supervision above half the supervised hours');
	}

	return {
		hours: round(hours),
		note: notes.length === 0 ? null : `Reduced by ${notes.join(', ')}.`
	};
}

/**
 * Check one month.
 *
 * The monthly floor is a real requirement and not advice: hours in a month below it do
 * not count at all, which is the single most expensive thing a trainee can not know.
 */
export function summariseFieldworkMonth(
	m: FieldworkMonthInput,
	req: FieldworkRequirement,
	rules: FieldworkRuleset
): FieldworkMonthSummary {
	const concentrated = m.type === 'concentrated';
	const needPercent = concentrated ? rules.concentratedPercent : rules.supervisedPercent;
	const needContacts = concentrated ? rules.concentratedContacts : rules.supervisedContacts;
	const needMinutes = concentrated
		? rules.concentratedObservationMinutes
		: rules.observationMinutes;

	/*
	 * Group supervision may not exceed half the supervised hours, and the handbook's remedy
	 * is to cut the group hours back until it does. So the percentage is worked out against
	 * what survives that cut, not against everything logged — otherwise a month of nothing
	 * but group meetings would read as fully supervised.
	 */
	const countableSupervision = Math.min(m.supervisionHours, 2 * m.individualSupervisionHours);
	const requiredSupervision = round((m.totalHours * needPercent) / 100);
	const supervisionPercent = pct(countableSupervision, m.totalHours);
	const observationMet =
		needMinutes === null
			? m.observedWithClient
			: m.observationMinutes + EPSILON >= needMinutes;

	const monthRatios = req.ratios.filter((r) => r.scopeVerified && r.scope === 'month');

	const checks: Check[] = [
		{
			id: 'monthly-hours',
			label: `${rules.monthlyMinHours} to ${rules.monthlyMaxHours} hours`,
			met:
				m.totalHours + EPSILON >= rules.monthlyMinHours &&
				m.totalHours <= rules.monthlyMaxHours + EPSILON,
			detail:
				m.totalHours < rules.monthlyMinHours
					? `${m.totalHours} logged. Below the floor, so none of this month counts.`
					: m.totalHours > rules.monthlyMaxHours
						? `${m.totalHours} logged. Above the ceiling, so the excess does not count.`
						: `${m.totalHours} logged.`
		},
		{
			id: 'supervision-percent',
			label: `${needPercent}% supervised`,
			met: countableSupervision + EPSILON >= requiredSupervision,
			detail:
				countableSupervision + EPSILON < m.supervisionHours
					? `${round(countableSupervision)} of ${requiredSupervision} hours needed (${supervisionPercent}%), counting only the group hours that individual supervision supports.`
					: `${round(countableSupervision)} of ${requiredSupervision} hours needed (${supervisionPercent}%).`
		},
		{
			id: 'contacts',
			label: `${needContacts} supervisor contacts`,
			met: m.contacts >= needContacts,
			detail: `${m.contacts} logged.`
		},
		needMinutes === null
			? {
					id: 'observation',
					label: 'Observed with a client',
					met: observationMet,
					detail: observationMet ? 'Yes.' : 'Not yet this month — without it no hours count.'
				}
			: {
					id: 'observation',
					label: `${needMinutes} minutes observed`,
					met: observationMet,
					detail: `${m.observationMinutes} of ${needMinutes} minutes.`
				},
		/*
		 * A ratio the handbook states per supervisory period is a monthly requirement like
		 * any other, so it is judged here rather than reported as a figure. The ones stated
		 * across the whole experience stay out of the month entirely — a light month is not
		 * a failed month when the rule is cumulative.
		 */
		...monthRatios.map((ratio): Check => {
			const value =
				ratio.id === 'individual-supervision'
					? pct(m.individualSupervisionHours, m.supervisionHours)
					: pct(m.unrestrictedHours, m.totalHours);
			return {
				id: ratio.id,
				label: `${ratio.percent}% ${ratio.label.toLowerCase()}`,
				met: value + EPSILON >= ratio.percent,
				detail: `${value}% of ${ratio.of} this month.`
			};
		})
	];

	/*
	 * The two ratios whose scope the handbook text does not settle.
	 *
	 * Shown as figures rather than verdicts while that is true. Calling a light month a
	 * failed month when the rule is actually cumulative would send somebody to argue with
	 * their supervisor over nothing; the reverse would let a real problem pass. Neither is
	 * a guess worth making.
	 */
	const figures: Figure[] = req.ratios
		.filter((ratio) => !(ratio.scopeVerified && ratio.scope === 'month'))
		.map((ratio) => {
			const value =
				ratio.id === 'individual-supervision'
					? pct(m.individualSupervisionHours, m.supervisionHours)
					: pct(m.unrestrictedHours, m.totalHours);
			return {
				id: ratio.id,
				label: ratio.label,
				detail: `${value}% of ${ratio.of} this month.`,
				note: !ratio.scopeVerified
					? `At least ${ratio.percent}% is required, but this app has not verified whether that is checked per month or across the whole experience. Ask your supervisor.`
					: `At least ${ratio.percent}% is required across the whole experience, not this month, so a light month here is not a lost one.`
			};
		});

	const eligible = eligibleHours(m, rules, {
		concentrated,
		observationMet,
		needPercent,
		needContacts,
		countableSupervision
	});

	return {
		month: m.month,
		type: m.type,
		checks,
		figures,
		standing: checks.some((c) => c.met === false)
			? 'short'
			: checks.some((c) => c.met === null)
				? 'unknown'
				: 'met',
		creditedHours: creditedHours({ type: m.type, totalHours: eligible.hours }, req),
		creditNote: eligible.note
	};
}

export interface FieldworkProgress {
	/** Hours that will actually count, after floors, ceilings and the multiplier. */
	credited: number;
	required: number;
	remaining: number;
	percent: number;
	monthsLogged: number;
	monthsShort: number;
	/** Hours logged that will not count, and why that is worth seeing. */
	forfeited: number;
	/**
	 * Cumulative ratios. A ratio the handbook checks per month carries no cumulative
	 * verdict — the months hold that — so `met` is null and the page says where to look.
	 */
	ratios: {
		id: string;
		label: string;
		value: number;
		percent: number;
		met: boolean | null;
		scope: 'month' | 'total' | null;
	}[];
	/** Null until a start date is known. */
	deadline: string | null;
	daysRemaining: number | null;
	expired: boolean;
}

export function addYears(date: string, years: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCFullYear(d.getUTCFullYear() + years);
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

export function summariseFieldwork(
	months: FieldworkMonthInput[],
	req: FieldworkRequirement,
	rules: FieldworkRuleset,
	startDate: string | null,
	today: string
): FieldworkProgress {
	const summaries = months.map((m) => summariseFieldworkMonth(m, req, rules));
	const credited = round(summaries.reduce((sum, s) => sum + s.creditedHours, 0));
	const loggedCredit = round(months.reduce((sum, m) => sum + creditedHours(m, req), 0));

	const totals = months.reduce(
		(acc, m) => ({
			hours: acc.hours + m.totalHours,
			unrestricted: acc.unrestricted + m.unrestrictedHours,
			supervision: acc.supervision + m.supervisionHours,
			individual: acc.individual + m.individualSupervisionHours
		}),
		{ hours: 0, unrestricted: 0, supervision: 0, individual: 0 }
	);

	const ratios = req.ratios.map((r) => {
		const value =
			r.id === 'individual-supervision'
				? pct(totals.individual, totals.supervision)
				: pct(totals.unrestricted, totals.hours);
		return {
			id: r.id,
			label: r.label,
			value,
			percent: r.percent,
			met: r.scope === 'month' ? null : value + EPSILON >= r.percent,
			scope: r.scope
		};
	});

	const deadline = startDate ? addYears(startDate, req.windowYears) : null;
	const daysRemaining = deadline
		? Math.round(
				(Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
			)
		: null;

	return {
		credited,
		required: req.totalHours,
		remaining: round(Math.max(0, req.totalHours - credited)),
		percent: Math.min(100, Math.round((100 * credited) / req.totalHours)),
		monthsLogged: months.length,
		monthsShort: summaries.filter((s) => s.standing === 'short').length,
		// What the floors and ceilings took. Seeing it is the point: it is the number that
		// turns "I logged 2000 hours" into "1840 of them count".
		forfeited: round(Math.max(0, loggedCredit - credited)),
		ratios,
		deadline,
		daysRemaining,
		expired: daysRemaining !== null && daysRemaining < 0
	};
}
