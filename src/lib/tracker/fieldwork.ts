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

	const requiredSupervision = round((m.totalHours * needPercent) / 100);
	const supervisionPercent = pct(m.supervisionHours, m.totalHours);

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
			met: m.supervisionHours + EPSILON >= requiredSupervision,
			detail: `${round(m.supervisionHours)} of ${requiredSupervision} hours needed (${supervisionPercent}%).`
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
					met: m.observedWithClient,
					detail: m.observedWithClient ? 'Yes.' : 'Not yet this month.'
				}
			: {
					id: 'observation',
					label: `${needMinutes} minutes observed`,
					met: m.observationMinutes + EPSILON >= needMinutes,
					detail: `${m.observationMinutes} of ${needMinutes} minutes.`
				}
	];

	/*
	 * The two ratios whose scope the handbook text does not settle.
	 *
	 * Shown as figures rather than verdicts while that is true. Calling a light month a
	 * failed month when the rule is actually cumulative would send somebody to argue with
	 * their supervisor over nothing; the reverse would let a real problem pass. Neither is
	 * a guess worth making.
	 */
	const figures: Figure[] = req.ratios.map((ratio) => {
		const value =
			ratio.id === 'individual-supervision'
				? pct(m.individualSupervisionHours, m.supervisionHours)
				: pct(m.unrestrictedHours, m.totalHours);
		return {
			id: ratio.id,
			label: ratio.label,
			detail: `${value}% of ${ratio.of} this month.`,
			note: ratio.scopeVerified
				? `At least ${ratio.percent}%.`
				: `At least ${ratio.percent}% is required, but this app has not verified whether that is checked per month or across the whole experience. Ask your supervisor.`
		};
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
		// A month below the floor contributes nothing, which is the whole point of the floor.
		creditedHours:
			m.totalHours + EPSILON >= rules.monthlyMinHours
				? creditedHours(
						{ type: m.type, totalHours: Math.min(m.totalHours, rules.monthlyMaxHours) },
						req
					)
				: 0
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
	/** Cumulative ratios, which are safe to state whatever the scope turns out to be. */
	ratios: { id: string; label: string; value: number; percent: number; met: boolean }[];
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
			met: value + EPSILON >= r.percent
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
