import { describe, expect, it } from 'vitest';
import {
	addYears,
	creditedHours,
	rulesetById,
	summariseFieldwork,
	summariseFieldworkMonth,
	supervisorStanding,
	type FieldworkMonthInput,
	type FieldworkMonthSummary,
	type FieldworkRequirement
} from './fieldwork.js';

/*
 * The numbers are the handbook's, because a test against invented thresholds proves
 * nothing about arithmetic somebody's certification depends on.
 */
const REQ: FieldworkRequirement = {
	totalHours: 2000,
	concentratedTotalHours: 1500,
	concentratedMultiplier: 1.33,
	windowYears: 5,
	documentationLocator: 'Documentation of Fieldwork, p. 15',
	supervisor: {
		items: [{ id: 'good-standing', label: 'Certified and in good standing' }],
		contractRequired: true,
		locator: 'Supervisor qualifications, p. 13'
	},
	locator: 'Hour Requirements, p. 15',
	rulesets: [
		{
			id: 'current',
			label: 'Current requirements',
			effectiveFrom: null,
			monthlyMinHours: 20,
			monthlyMaxHours: 130,
			supervisedPercent: 5,
			concentratedPercent: 10,
			supervisedContacts: 4,
			concentratedContacts: 6,
			observationMinutes: null,
			concentratedObservationMinutes: null,
			locator: 'Overview, p. 14'
		},
		{
			id: '2027',
			label: '2027 requirements',
			effectiveFrom: '2027-01-01',
			monthlyMinHours: 20,
			monthlyMaxHours: 160,
			supervisedPercent: 5,
			concentratedPercent: 7.5,
			supervisedContacts: 4,
			concentratedContacts: 6,
			observationMinutes: 60,
			concentratedObservationMinutes: 90,
			locator: '2027 Eligibility Requirements, p. 28'
		}
	],
	ratios: [
		{
			id: 'individual-supervision',
			label: 'Individual supervision',
			percent: 50,
			of: 'the supervision you received',
			scopeVerified: true,
			scope: 'month',
			locator: 'Individual Supervision, p. 20'
		},
		{
			id: 'unrestricted',
			label: 'Unrestricted activity',
			percent: 60,
			of: 'all fieldwork hours',
			scopeVerified: true,
			scope: 'total',
			locator: 'Types of Fieldwork Activity, p. 17'
		}
	],
	excluded: ['Conferences']
};

const CURRENT = rulesetById(REQ, 'current');
const R2027 = rulesetById(REQ, '2027');

function month(over: Partial<FieldworkMonthInput> = {}): FieldworkMonthInput {
	return {
		month: '2026-09',
		type: 'supervised',
		maxGroupSize: 0,
		totalHours: 100,
		unrestrictedHours: 70,
		supervisionHours: 6,
		individualSupervisionHours: 4,
		contacts: 4,
		observedWithClient: true,
		observationMinutes: 90,
		...over
	};
}

const check = (s: FieldworkMonthSummary, id: string) => s.checks.find((c) => c.id === id)!;

describe('summariseFieldworkMonth', () => {
	it('passes a month that meets everything', () => {
		const s = summariseFieldworkMonth(month(), REQ, CURRENT);
		expect(s.standing).toBe('met');
		expect(s.creditedHours).toBe(100);
	});

	it('credits NOTHING for a month under the floor', () => {
		// The most expensive thing a trainee can not know: hours below the monthly floor
		// do not shrink, they vanish.
		const s = summariseFieldworkMonth(
			month({ totalHours: 18, supervisionHours: 2 }),
			REQ,
			CURRENT
		);
		expect(check(s, 'monthly-hours').met).toBe(false);
		expect(check(s, 'monthly-hours').detail).toMatch(/none of this month counts/);
		expect(s.creditedHours).toBe(0);
	});

	it('credits only up to the ceiling', () => {
		const s = summariseFieldworkMonth(
			month({ totalHours: 150, supervisionHours: 10 }),
			REQ,
			CURRENT
		);
		expect(check(s, 'monthly-hours').met).toBe(false);
		expect(s.creditedHours).toBe(130);
	});

	it('holds concentrated fieldwork to a higher bar and pays it more', () => {
		// 10% rather than 5%, six contacts rather than four — and 1.33 hours of credit.
		const s = summariseFieldworkMonth(
			month({
				type: 'concentrated',
				supervisionHours: 10,
				individualSupervisionHours: 5,
				contacts: 6
			}),
			REQ,
			CURRENT
		);
		expect(s.standing).toBe('met');
		expect(check(s, 'supervision-percent').detail).toContain('of 10 hours needed');
		expect(s.creditedHours).toBe(133);
	});

	it('pays a deficient concentrated month NOTHING, because it cannot be adjusted', () => {
		// The handbook allows the adjustments below only for Supervised Fieldwork, so a
		// concentrated month that misses a requirement has no remedy left to it.
		const s = summariseFieldworkMonth(
			month({ type: 'concentrated', supervisionHours: 6, contacts: 4 }),
			REQ,
			CURRENT
		);
		expect(check(s, 'supervision-percent').met).toBe(false);
		expect(check(s, 'contacts').met).toBe(false);
		expect(s.creditedHours).toBe(0);
		expect(s.creditNote).toMatch(/may not be prorated or adjusted/);
	});

	it('switches to counting observation minutes under the 2027 rules', () => {
		const under = summariseFieldworkMonth(month({ observationMinutes: 45 }), REQ, R2027);
		expect(check(under, 'observation').label).toBe('60 minutes observed');
		expect(check(under, 'observation').met).toBe(false);

		// The current rules ask a different question of the same month, and it passes.
		const now = summariseFieldworkMonth(month({ observationMinutes: 45 }), REQ, CURRENT);
		expect(check(now, 'observation').label).toBe('Observed with a client');
		expect(check(now, 'observation').met).toBe(true);
	});

	it('raises the ceiling and lowers the concentrated percentage in 2027', () => {
		const s = summariseFieldworkMonth(
			// Individual supervision has to keep pace, or the group cap binds before the
			// percentage does and the test would be measuring the wrong rule.
			month({
				totalHours: 150,
				type: 'concentrated',
				supervisionHours: 11.25,
				individualSupervisionHours: 6
			}),
			REQ,
			R2027
		);
		expect(check(s, 'monthly-hours').met).toBe(true);
		expect(check(s, 'supervision-percent').met).toBe(true);
	});

	it('judges the monthly ratio and leaves the cumulative one alone', () => {
		// The handbook settles both scopes and they differ: individual supervision is a
		// monthly test, unrestricted activity is measured across the whole experience. A
		// light month of unrestricted work is not a failed month, so it gets no verdict.
		const s = summariseFieldworkMonth(
			month({ unrestrictedHours: 10, supervisionHours: 6, individualSupervisionHours: 1 }),
			REQ,
			CURRENT
		);
		expect(check(s, 'individual-supervision').met).toBe(false);
		expect(s.checks.map((c) => c.id)).not.toContain('unrestricted');
		const unrestricted = s.figures.find((f) => f.id === 'unrestricted')!;
		expect(unrestricted.detail).toBe('10% of all fieldwork hours this month.');
		expect(unrestricted.note).toMatch(/across the whole experience, not this month/);
	});
});

/*
 * The handbook gives a different adjustment for each requirement a month can miss, and the
 * differences decide hundreds of hours. One test per row, because the rows are what the
 * app is claiming to know.
 */
describe("the handbook's monthly adjustments", () => {
	it('pays NOTHING for a month with no observation of the trainee with a client', () => {
		const s = summariseFieldworkMonth(month({ observedWithClient: false }), REQ, CURRENT);
		expect(s.creditedHours).toBe(0);
		expect(s.creditNote).toMatch(/No observation with a client/);
	});

	it('prorates a month by the fraction of required contacts that happened', () => {
		// The handbook's own worked example: 2 of 4 contacts and 110 hours gives 55.
		const s = summariseFieldworkMonth(
			month({ totalHours: 110, supervisionHours: 8, contacts: 2 }),
			REQ,
			CURRENT
		);
		expect(check(s, 'contacts').met).toBe(false);
		expect(s.creditedHours).toBe(55);
		expect(s.creditNote).toMatch(/2 of 4 supervisor contacts/);
	});

	it('cuts a month back to the hours its supervision actually supports', () => {
		// 3 hours of supervision supports 60 hours at 5%, not the 100 that were logged.
		const s = summariseFieldworkMonth(
			month({ totalHours: 100, supervisionHours: 3, individualSupervisionHours: 2 }),
			REQ,
			CURRENT
		);
		expect(check(s, 'supervision-percent').met).toBe(false);
		expect(s.creditedHours).toBe(60);
		expect(s.creditNote).toMatch(/5% supervision minimum/);
	});

	it('does not count group supervision beyond what individual supervision supports', () => {
		// 10 hours logged but only 1 individual, so 2 hours count — enough for 40 hours.
		const s = summariseFieldworkMonth(
			month({ totalHours: 100, supervisionHours: 10, individualSupervisionHours: 1 }),
			REQ,
			CURRENT
		);
		expect(check(s, 'supervision-percent').met).toBe(false);
		expect(check(s, 'supervision-percent').detail).toMatch(/counting only the group hours/);
		expect(s.creditedHours).toBe(40);
	});

	it('takes the binding adjustment rather than compounding two of them', () => {
		// Each remedy is stated against the month's own total. 2 of 4 contacts gives 50, and
		// 4 hours of supervision supports 80; the smaller one is the answer, not 40.
		const s = summariseFieldworkMonth(
			month({
				totalHours: 100,
				supervisionHours: 4,
				individualSupervisionHours: 3,
				contacts: 2
			}),
			REQ,
			CURRENT
		);
		expect(s.creditedHours).toBe(50);
	});

	it('leaves a compliant month entirely alone', () => {
		const s = summariseFieldworkMonth(month(), REQ, CURRENT);
		expect(s.creditedHours).toBe(100);
		expect(s.creditNote).toBeNull();
	});
});

describe('summariseFieldwork', () => {
	it('adds up credited hours and says what the floors took', () => {
		const months = [
			month({ month: '2026-07' }),
			month({ month: '2026-08', totalHours: 15, supervisionHours: 1 }),
			month({ month: '2026-09', totalHours: 150, supervisionHours: 8 })
		];
		const p = summariseFieldwork(months, REQ, CURRENT, '2026-07-01', '2026-10-01');
		// 100 + 0 + 130.
		expect(p.credited).toBe(230);
		// The number that turns "I logged 265 hours" into "230 of them count".
		expect(p.forfeited).toBe(35);
		expect(p.monthsShort).toBe(2);
		expect(p.remaining).toBe(1770);
	});

	it('states the cumulative ratios, which hold whatever the scope turns out to be', () => {
		const months = [
			month({
				totalHours: 100,
				unrestrictedHours: 40,
				supervisionHours: 10,
				individualSupervisionHours: 8
			}),
			month({
				month: '2026-10',
				totalHours: 100,
				unrestrictedHours: 80,
				supervisionHours: 10,
				individualSupervisionHours: 2
			})
		];
		const p = summariseFieldwork(months, REQ, CURRENT, null, '2026-11-01');
		const unrestricted = p.ratios.find((r) => r.id === 'unrestricted')!;
		expect(unrestricted.value).toBe(60);
		expect(unrestricted.met).toBe(true);
		// A cumulative 50% is no defence against a month that was 20%, so the total carries
		// the figure and refuses the verdict. The months hold that one.
		const individual = p.ratios.find((r) => r.id === 'individual-supervision')!;
		expect(individual.value).toBe(50);
		expect(individual.met).toBeNull();
		expect(individual.scope).toBe('month');
	});

	it('counts down the five-year window from the start date', () => {
		const p = summariseFieldwork([], REQ, CURRENT, '2026-01-01', '2026-01-01');
		// Five continuous years ends the day before the anniversary.
		expect(p.deadline).toBe('2030-12-31');
		// 2026-2030 spans one leap day, so five years less a day is 1825.
		expect(p.daysRemaining).toBe(1825);
		expect(p.expired).toBe(false);
	});

	it('knows when the window has closed', () => {
		const p = summariseFieldwork([], REQ, CURRENT, '2020-01-01', '2026-01-01');
		expect(p.expired).toBe(true);
	});

	it('says nothing about a deadline before a start date is known', () => {
		const p = summariseFieldwork([month()], REQ, CURRENT, null, '2026-10-01');
		expect(p.deadline).toBeNull();
		expect(p.daysRemaining).toBeNull();
		expect(p.expired).toBe(false);
	});
});

describe('creditedHours', () => {
	it('pays concentrated hours at the published multiplier', () => {
		expect(creditedHours({ type: 'supervised', totalHours: 100 }, REQ)).toBe(100);
		expect(creditedHours({ type: 'concentrated', totalHours: 100 }, REQ)).toBe(133);
	});

	it('gets a full concentrated route close enough to the total', () => {
		// 1500 at 1.33 is 1995, not 2000. That is the published rounding, not an error,
		// and the schema check tolerates exactly this much.
		expect(creditedHours({ type: 'concentrated', totalHours: 1500 }, REQ)).toBe(1995);
	});
});

describe('addYears', () => {
	it('ends the window the day before the anniversary', () => {
		expect(addYears('2026-01-01', 5)).toBe('2030-12-31');
		expect(addYears('2024-02-29', 5)).toBe('2029-02-28');
	});
});

describe('where a supervisor stands', () => {
	const supervisorReq = {
		items: [
			{ id: 'good-standing', label: 'Certified and in good standing' },
			{ id: 'tenure', label: 'Certified for at least a year, or consulting' },
			{ id: 'supervision-training', label: 'Meets the supervision CE requirement' }
		],
		contractRequired: true,
		locator: 'Supervisor qualifications, p. 13'
	};
	const all = ['good-standing', 'tenure', 'supervision-training'];
	const logged = [
		{ month: '2026-02', supervisorCode: 'S-01' },
		{ month: '2026-03', supervisorCode: 'S-01' },
		{ month: '2026-04', supervisorCode: 'S-02' }
	];

	it('starts unconfirmed, which is the state worth shouting about', () => {
		const s = supervisorStanding('S-01', null, logged, supervisorReq);
		expect(s.state).toBe('unconfirmed');
		expect(s.outstanding).toHaveLength(3);
		// And it names how much rests on it, because "unconfirmed" on two months is a
		// different problem from "unconfirmed" on eighteen.
		expect(s.months).toBe(2);
	});

	it('separates "not looked yet" from "looked and something is missing"', () => {
		/*
		 * Not a cosmetic distinction. Nobody has checked is the ordinary starting state of
		 * every record; somebody checked and one item did not hold is a finding, and it is
		 * the more urgent of the two.
		 */
		const partial = supervisorStanding(
			'S-01',
			{
				code: 'S-01',
				confirmed: ['good-standing'],
				confirmedOn: '2026-02-01',
				contractSignedOn: '2026-01-15'
			},
			logged,
			supervisorReq
		);
		expect(partial.state).toBe('incomplete');
		expect(partial.outstanding.map((i) => i.id)).toEqual(['tenure', 'supervision-training']);
	});

	it('is not confirmed without the contract, even with every box ticked', () => {
		const s = supervisorStanding(
			'S-01',
			{ code: 'S-01', confirmed: all, confirmedOn: '2026-02-01', contractSignedOn: null },
			logged,
			supervisorReq
		);
		expect(s.state).toBe('incomplete');
		expect(s.outstanding).toHaveLength(0);
	});

	it('is confirmed when everything holds', () => {
		const s = supervisorStanding(
			'S-01',
			{
				code: 'S-01',
				confirmed: all,
				confirmedOn: '2026-02-01',
				contractSignedOn: '2026-01-15'
			},
			logged,
			supervisorReq
		);
		expect(s.state).toBe('confirmed');
		expect(s.confirmedOn).toBe('2026-02-01');
	});

	it('names months logged before the contract was signed', () => {
		// The one part of this the app can actually check rather than take on trust.
		const s = supervisorStanding(
			'S-01',
			{
				code: 'S-01',
				confirmed: all,
				confirmedOn: '2026-04-01',
				contractSignedOn: '2026-03-10'
			},
			logged,
			supervisorReq
		);
		expect(s.monthsBeforeContract).toEqual(['2026-02']);
	});

	it('does not report a month the contract was signed inside', () => {
		/*
		 * A contract signed on the 10th covers part of that month, and the log holds months
		 * rather than days. Reporting it would be the app guessing, and a false alarm on a
		 * compliance page is worse than a quiet one — it teaches people to ignore the true
		 * ones.
		 */
		const s = supervisorStanding(
			'S-01',
			{
				code: 'S-01',
				confirmed: all,
				confirmedOn: '2026-03-01',
				contractSignedOn: '2026-02-10'
			},
			logged,
			supervisorReq
		);
		expect(s.monthsBeforeContract).toEqual([]);
	});

	it('counts only the months that supervisor signed for', () => {
		const s = supervisorStanding('S-02', null, logged, supervisorReq);
		expect(s.months).toBe(1);
	});

	it('takes the checklist from content rather than knowing it', () => {
		// A handbook revision should be a content edit, not a release.
		const s = supervisorStanding('S-01', null, logged, {
			items: [{ id: 'only-one', label: 'Something else entirely' }],
			contractRequired: false,
			locator: 'x'
		});
		expect(s.outstanding.map((i) => i.id)).toEqual(['only-one']);
	});
});

describe('the group meeting size', () => {
	it('is reported, never judged', () => {
		/*
		 * The handbook caps how many trainees a group supervision meeting may hold, and this
		 * app has not read that figure at source. A compliance tool that fails a month
		 * against a number it invented is the exact failure this corpus is built against, so
		 * the number is kept and shown and the verdict waits for somebody to read the
		 * handbook — the same posture as the ratios whose scope is unverified.
		 */
		const s = summariseFieldworkMonth(
			month({ supervisionHours: 6, individualSupervisionHours: 3, maxGroupSize: 14 }),
			REQ,
			CURRENT
		);
		expect(s.checks.map((c) => c.id)).not.toContain('group-size');
		const figure = s.figures.find((f) => f.id === 'group-size')!;
		expect(figure.detail).toContain('14');
		expect(figure.note).toContain('has not verified');
		// A figure is not a failure: fourteen in a group does not make the month short.
		expect(s.standing).toBe('met');
	});

	it('says nothing when no supervision was in a group', () => {
		// One-to-one throughout: there is no group, so asking about its size is noise.
		const s = summariseFieldworkMonth(
			month({ supervisionHours: 6, individualSupervisionHours: 6, maxGroupSize: 0 }),
			REQ,
			CURRENT
		);
		expect(s.figures.find((f) => f.id === 'group-size')).toBeUndefined();
	});

	it('notices group hours logged with no size recorded', () => {
		// The number cannot be reconstructed in two years, so the gap is worth naming now.
		const s = summariseFieldworkMonth(
			month({ supervisionHours: 6, individualSupervisionHours: 3, maxGroupSize: 0 }),
			REQ,
			CURRENT
		);
		expect(s.figures.find((f) => f.id === 'group-size')!.detail).toContain(
			'no group size was recorded'
		);
	});
});
