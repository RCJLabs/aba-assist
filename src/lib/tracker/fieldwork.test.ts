import { describe, expect, it } from 'vitest';
import {
	addYears,
	creditedHours,
	rulesetById,
	summariseFieldwork,
	summariseFieldworkMonth,
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
			scopeVerified: false,
			scope: null,
			locator: 'Overview, p. 14'
		},
		{
			id: 'unrestricted',
			label: 'Unrestricted activity',
			percent: 60,
			of: 'all fieldwork hours',
			scopeVerified: false,
			scope: null,
			locator: 'Overview, p. 14'
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
			month({ type: 'concentrated', supervisionHours: 6, contacts: 4 }),
			REQ,
			CURRENT
		);
		expect(check(s, 'supervision-percent').met).toBe(false);
		expect(check(s, 'supervision-percent').detail).toContain('of 10 hours needed');
		expect(check(s, 'contacts').met).toBe(false);
		expect(s.creditedHours).toBe(133);
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
			month({ totalHours: 150, type: 'concentrated', supervisionHours: 11.25 }),
			REQ,
			R2027
		);
		expect(check(s, 'monthly-hours').met).toBe(true);
		expect(check(s, 'supervision-percent').met).toBe(true);
	});

	it('reports the two unsettled ratios as figures, never as a verdict', () => {
		// Calling a light month a failed month when the rule may be cumulative would send
		// somebody to argue with a supervisor over nothing.
		const s = summariseFieldworkMonth(
			month({ unrestrictedHours: 10, individualSupervisionHours: 0 }),
			REQ,
			CURRENT
		);
		expect(s.standing).toBe('met');
		expect(s.checks.map((c) => c.id)).not.toContain('unrestricted');
		const unrestricted = s.figures.find((f) => f.id === 'unrestricted')!;
		expect(unrestricted.detail).toBe('10% of all fieldwork hours this month.');
		expect(unrestricted.note).toMatch(/has not verified whether/);
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
		const individual = p.ratios.find((r) => r.id === 'individual-supervision')!;
		expect(individual.value).toBe(50);
		expect(individual.met).toBe(true);
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
