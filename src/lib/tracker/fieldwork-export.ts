/**
 * The whole fieldwork record, as spreadsheet files.
 *
 * Supervision documentation has to be kept for years and may have to be produced long
 * after the fact, by which time the app that held it may be gone, the browser may have
 * cleared its storage, and the person asking will not accept "it was in an app". So the
 * export is the artifact and the app is the convenience, not the other way round.
 *
 * The existing `fieldworkCsv` dumps the months as entered. That is a log, not a record:
 * it says what was typed and nothing about whether any of it counts. What a fieldwork
 * record has to answer is four questions, which is why this is four files:
 *
 *   1. what run this is, and under whose rules
 *   2. what happened each month, and whether that month met the requirements
 *   3. where the totals stand against what is required
 *   4. what the requirements actually are, and where in the handbook to check them
 *
 * The fourth is the one that is easy to leave out and the one that makes the other three
 * auditable. A spreadsheet of hours with a "short" column and no statement of the
 * threshold asks the reader to trust an app they have never seen.
 *
 * Four files rather than one workbook with tabs, deliberately. A real `.xlsx` needs a
 * spreadsheet library, and this is an offline PWA whose entire free corpus is about a
 * megabyte and a half — several hundred kilobytes of formatting code would ship to
 * everybody who opens the glossary. CSV is what Excel and Google Sheets both import
 * natively, and the formatting is theirs to apply.
 */
import type { FieldworkMonth, FieldworkPeriod } from '$lib/db/index.js';
import {
	summariseFieldwork,
	summariseFieldworkMonth,
	type FieldworkMonthInput,
	type FieldworkRequirement,
	type FieldworkRuleset
} from './fieldwork.js';
import { toCsv } from './csv.js';

export interface ExportFile {
	/** A filename that sorts into reading order in a downloads folder. */
	name: string;
	csv: string;
}

const yesNo = (b: boolean) => (b ? 'yes' : 'no');
const round1 = (n: number) => Math.round(n * 10) / 10;

/** A `met` that may be unknowable, said in words rather than as a blank. */
function verdict(met: boolean | null): string {
	if (met === null) return 'not known';
	return met ? 'met' : 'short';
}

function toInput(m: FieldworkMonth): FieldworkMonthInput {
	return {
		month: m.month,
		type: m.type,
		totalHours: m.totalHours,
		unrestrictedHours: m.unrestrictedHours,
		supervisionHours: m.supervisionHours,
		individualSupervisionHours: m.individualSupervisionHours,
		contacts: m.contacts,
		observedWithClient: m.observedWithClient,
		observationMinutes: m.observationMinutes
	};
}

/**
 * File 1: what this run is.
 *
 * Two columns rather than one wide row, because it is read by a person rather than
 * summed by a machine, and a fifteen-column single-row sheet is unreadable in both Excel
 * and Sheets.
 */
function periodFile(
	period: FieldworkPeriod | null,
	rules: FieldworkRuleset,
	req: FieldworkRequirement,
	handbookVersion: string,
	today: string
): ExportFile {
	const rows: (string | number)[][] = [
		['Record generated', today],
		['Requirements read from', `BCBA handbook ${handbookVersion}`],
		['Ruleset in force', rules.label],
		/*
		 * The supervisor this run began under, not the supervisor of record. Each month
		 * carries its own, because the monthly verification form is completed per
		 * supervisor and trainees change them — stamping one code across a whole record was
		 * how this file used to answer the question, and it was wrong the moment anybody
		 * moved.
		 */
		['Supervisor the run started with', period?.supervisorCode ?? 'not recorded'],
		['Fieldwork started', period?.startDate ?? 'not recorded'],
		['Must be completed within', `${req.windowYears} years`],
		['Credited hours required', req.totalHours],
		[
			'Concentrated hours required, if all concentrated',
			`${req.concentratedTotalHours} (each counts ${req.concentratedMultiplier}×)`
		]
	];
	return { name: 'fieldwork-1-period.csv', csv: toCsv(['Field', 'Value'], rows) };
}

/**
 * File 2: the months, with a verdict on each.
 *
 * Restricted hours are given as their own column rather than left to be worked out from
 * the other two. It is the number with a ceiling on it, and a record that makes the
 * reader do the subtraction is a record that gets the subtraction wrong.
 */
function monthsFile(
	months: FieldworkMonth[],
	req: FieldworkRequirement,
	rules: FieldworkRuleset
): ExportFile {
	const rows = [...months]
		.sort((a, b) => a.month.localeCompare(b.month))
		.map((m) => {
			const s = summariseFieldworkMonth(toInput(m), req, rules);
			const failed = s.checks.filter((c) => c.met === false).map((c) => c.label);
			const unknown = s.checks.filter((c) => c.met === null).map((c) => c.label);
			return [
				m.month,
				m.type,
				m.supervisorCode || 'not recorded',
				m.totalHours,
				m.unrestrictedHours,
				round1(m.totalHours - m.unrestrictedHours),
				m.totalHours === 0 ? '' : `${round1((100 * m.unrestrictedHours) / m.totalHours)}%`,
				m.supervisionHours,
				m.totalHours === 0 ? '' : `${round1((100 * m.supervisionHours) / m.totalHours)}%`,
				m.individualSupervisionHours,
				m.contacts,
				yesNo(m.observedWithClient),
				m.observationMinutes,
				s.creditedHours,
				s.standing,
				failed.join('; '),
				unknown.join('; '),
				s.creditNote ?? '',
				yesNo(m.verificationSigned),
				m.signedOn ?? '',
				m.note
			];
		});

	return {
		name: 'fieldwork-2-months.csv',
		csv: toCsv(
			[
				'Month',
				'Fieldwork type',
				'Supervisor code',
				'Total hours',
				'Unrestricted hours',
				'Restricted hours',
				'Unrestricted %',
				'Supervision hours',
				'Supervision %',
				'Individual supervision hours',
				'Supervision contacts',
				'Observed with a client',
				'Observation minutes',
				'Credited hours',
				'Month standing',
				'Requirements not met',
				'Could not be judged',
				'Why the credit differs',
				'Monthly form signed',
				'Signed on',
				'Note'
			],
			rows
		)
	};
}

/**
 * File 3: where the totals stand.
 *
 * The restricted ceiling is stated as an absolute number as well as a percentage, because
 * "no more than 40%" is not a number anybody can plan against and "no more than 800 of
 * your 2000 hours" is. It is computed from the hours required rather than written down:
 * a record built around a hard-coded 800 is wrong for everybody using concentrated hours,
 * where the same rule comes to 600 of 1500.
 */
function totalsFile(
	months: FieldworkMonth[],
	req: FieldworkRequirement,
	rules: FieldworkRuleset,
	period: FieldworkPeriod | null,
	today: string
): ExportFile {
	const progress = summariseFieldwork(
		months.map(toInput),
		req,
		rules,
		period?.startDate ?? null,
		today
	);
	const logged = months.reduce((n, m) => n + m.totalHours, 0);
	const unrestricted = months.reduce((n, m) => n + m.unrestrictedHours, 0);

	const rows: (string | number)[][] = [
		['Credited hours so far', progress.credited, '', ''],
		['Credited hours required', progress.required, '', ''],
		['Credited hours remaining', progress.remaining, '', ''],
		['Progress', `${progress.percent}%`, '', ''],
		['Months logged', progress.monthsLogged, '', ''],
		['Months that did not meet the requirements', progress.monthsShort, '', ''],
		['Hours logged that will not count', progress.forfeited, '', ''],
		['Hours logged in total', round1(logged), '', ''],
		['Unrestricted hours logged', round1(unrestricted), '', ''],
		['Restricted hours logged', round1(logged - unrestricted), '', '']
	];

	/*
	 * Who signed for what, and what is still unsigned.
	 *
	 * Hours and signatures are counted separately on purpose. The rules decide whether a
	 * month's hours count; a signature decides whether they can be shown to anybody. A
	 * month can be perfect on the first and missing on the second, and reporting it as
	 * "short" would send somebody to redo work that was fine. What they actually need is
	 * the list of months to go back and chase, while the supervisor who was there still
	 * remembers.
	 */
	const supervisors = [...new Set(months.map((m) => m.supervisorCode).filter(Boolean))].sort();
	const unsigned = months.filter((m) => !m.verificationSigned);
	rows.push([
		'Supervisors across this record',
		supervisors.length === 0 ? 'none recorded' : supervisors.join('; '),
		'',
		''
	]);
	rows.push([
		'Months with a signed monthly form',
		`${months.length - unsigned.length} of ${months.length}`,
		'',
		req.documentationLocator ?? ''
	]);
	rows.push([
		'Months still to be signed',
		unsigned.length === 0
			? 'none'
			: [...unsigned]
					.sort((a, b) => a.month.localeCompare(b.month))
					.map((m) => m.month)
					.join('; '),
		unsigned.length > 0 ? 'unsigned hours cannot be verified' : '',
		''
	]);

	for (const r of req.ratios) {
		/*
		 * A ratio the handbook checks month by month carries no cumulative verdict — the
		 * months hold that — so it is reported without one rather than given a number that
		 * looks like a pass.
		 */
		const scopeNote =
			r.scope === 'month'
				? 'judged month by month; see the months file'
				: r.scope === 'total'
					? 'judged across the whole record'
					: 'scope not verified against the handbook';
		const found = progress.ratios.find((x) => x.id === r.id);
		rows.push([
			`${r.label} — at least ${r.percent}% of ${r.of}`,
			found ? `${found.percent}%` : '',
			found?.met === null || found === undefined ? scopeNote : verdict(found.met),
			r.locator
		]);
	}

	// The absolute ceiling, derived from the requirement rather than written down.
	const restrictedCeiling = req.ratios.find((r) => r.id === 'unrestricted');
	if (restrictedCeiling) {
		const unrestrictedNeeded = round1((req.totalHours * restrictedCeiling.percent) / 100);
		rows.push([
			'Unrestricted hours needed, over a full record',
			`${unrestrictedNeeded} of ${req.totalHours}`,
			'',
			restrictedCeiling.locator
		]);
		rows.push([
			'Most restricted hours a full record may contain',
			`${round1(req.totalHours - unrestrictedNeeded)} of ${req.totalHours}`,
			'',
			restrictedCeiling.locator
		]);
	}

	rows.push(['Must be finished by', progress.deadline ?? 'not known', '', '']);
	rows.push([
		'Days remaining',
		progress.daysRemaining ?? 'not known',
		progress.expired ? 'the window has closed' : '',
		''
	]);

	return {
		name: 'fieldwork-3-totals.csv',
		csv: toCsv(['Measure', 'Value', 'Standing', 'Handbook reference'], rows)
	};
}

/**
 * File 4: the requirements themselves.
 *
 * The file that makes the other three auditable. A spreadsheet of hours with a "short"
 * column and no statement of the threshold asks the reader to trust an app they have
 * never seen; this one lets them check every verdict against the handbook page it came
 * from.
 */
function requirementsFile(req: FieldworkRequirement, rules: FieldworkRuleset): ExportFile {
	const rows: (string | number)[][] = [
		['Credited hours required', req.totalHours, req.locator],
		[
			'Concentrated hours required, if all concentrated',
			req.concentratedTotalHours,
			req.locator
		],
		[
			'What one concentrated hour counts as',
			`${req.concentratedMultiplier} hours`,
			req.locator
		],
		['Years to finish in', req.windowYears, req.locator],
		['Ruleset', rules.label, rules.locator],
		['Least hours in a countable month', rules.monthlyMinHours, rules.locator],
		['Most hours a month may count', rules.monthlyMaxHours, rules.locator],
		['Supervision, supervised month', `${rules.supervisedPercent}% of hours`, rules.locator],
		[
			'Supervision, concentrated month',
			`${rules.concentratedPercent}% of hours`,
			rules.locator
		],
		['Supervision contacts, supervised month', rules.supervisedContacts, rules.locator],
		['Supervision contacts, concentrated month', rules.concentratedContacts, rules.locator],
		[
			'Observation with a client, supervised month',
			rules.observationMinutes === null
				? 'at least one contact includes it'
				: `${rules.observationMinutes} minutes`,
			rules.locator
		],
		[
			'Observation with a client, concentrated month',
			rules.concentratedObservationMinutes === null
				? 'at least one contact includes it'
				: `${rules.concentratedObservationMinutes} minutes`,
			rules.locator
		]
	];

	for (const r of req.ratios) {
		rows.push([r.label, `at least ${r.percent}% of ${r.of}`, r.locator]);
	}
	for (const e of req.excluded) {
		rows.push(['Does not count as fieldwork', e, req.locator]);
	}

	return {
		name: 'fieldwork-4-requirements.csv',
		csv: toCsv(['Requirement', 'Value', 'Handbook reference'], rows)
	};
}

/**
 * The whole record, as four files in reading order.
 *
 * `handbookVersion` is carried through rather than looked up here so that the export
 * states which edition it was built against. A fieldwork record produced three years
 * later, against numbers that have since changed, should say which numbers it used.
 */
export function fieldworkRecord(args: {
	period: FieldworkPeriod | null;
	months: FieldworkMonth[];
	req: FieldworkRequirement;
	rules: FieldworkRuleset;
	handbookVersion: string;
	today: string;
}): ExportFile[] {
	const { period, months, req, rules, handbookVersion, today } = args;
	return [
		periodFile(period, rules, req, handbookVersion, today),
		monthsFile(months, req, rules),
		totalsFile(months, req, rules, period, today),
		requirementsFile(req, rules)
	];
}
