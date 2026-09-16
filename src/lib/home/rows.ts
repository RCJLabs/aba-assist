/**
 * The figures under the dial.
 *
 * The ring answers "how much of this exam have I been through". These answer the rest of
 * what somebody opens the app to check: what is due, what the month owes, what the cycle
 * owes, and what is left to be able to demonstrate. Each one is already computed properly
 * somewhere else — the scheduler, the tracker rules, the competency page — so nothing
 * here does arithmetic that another module owns. It reads those answers and says them in
 * one line each.
 *
 * Two rules the mockup did not have, and both matter:
 *
 * - **Never a bare red number.** A figure is coloured *and* carries a word. "3.1%" in red
 *   is unreadable to a third of the people this app is for, and the app has refused
 *   colour-alone everywhere else.
 * - **"Not checked" is not "failing".** The tracker already refuses to call a missing
 *   denominator non-compliance. A month with no service hours entered has no percentage,
 *   so the row says so rather than showing a number that would be wrong.
 */
import { NO_FIGURE, type Figure } from '$lib/ui/figures.js';
import type {
	CycleSummary,
	DevelopmentRequirement,
	MonthSummary,
	SupervisionRequirement
} from '$lib/tracker/rules.js';

export interface RowInputs {
	dueCards: number;
	weakest: { letter: string; name: string; accuracy: number } | null;
	weakestWeight: number | null;
	/** This calendar month at each workplace, or an empty list when none is modelled. */
	months: MonthSummary[];
	workplaceLabels: Record<string, string>;
	supervision: SupervisionRequirement | null;
	cycle: CycleSummary | null;
	development: DevelopmentRequirement | null;
	/** Self-marked competency tasks, and how many there are. Technician only. */
	competency: { ready: number; total: number } | null;
	/** Today, as YYYY-MM-DD, so the "days left in the month" figure is testable. */
	today: string;
}

/** Days from `today` to the last day of its own month, inclusive of neither end. */
export function daysLeftInMonth(today: string): number {
	const [y, m, d] = today.split('-').map(Number);
	if (!y || !m || !d) return 0;
	return new Date(y, m, 0).getDate() - d;
}

function pct(part: number, whole: number): string {
	return `${Math.round((part / whole) * 1000) / 10}%`;
}

/**
 * The supervision row.
 *
 * `standing` is short when *any* of the four monthly rules fails, not only the
 * percentage — so a month can sit comfortably above 5% and still be short on one-to-one
 * contacts. Showing the percentage and colouring it red would then point at the wrong
 * number, so the row names what is actually short instead.
 */
function supervisionRow(inputs: RowInputs): Figure | null {
	const req = inputs.supervision;
	if (!req) return null;

	const month = inputs.today.slice(0, 7);
	const mine = inputs.months.filter((m) => m.month === month);
	const days = daysLeftInMonth(inputs.today);
	const closes =
		days === 0 ? 'the month closes today' : days === 1 ? '1 day left' : `${days} days left`;

	if (mine.length === 0) {
		return {
			id: 'supervision',
			label: 'Supervision this month',
			detail: `Nothing logged yet · ${closes}`,
			value: NO_FIGURE,
			tone: 'unknown',
			note: 'not started',
			href: '/tools/supervision'
		};
	}

	// The worst standing leads: a well-supervised second job must not paper over a badly
	// supervised first one, which is why the rule is written per workplace.
	const order: Record<string, number> = { short: 0, unknown: 1, met: 2 };
	const worst = [...mine].sort((a, b) => order[a.standing]! - order[b.standing]!)[0]!;
	const where =
		mine.length > 1
			? ` · ${inputs.workplaceLabels[worst.workplaceId] ?? 'one workplace'}`
			: '';

	const value =
		worst.serviceHours && worst.serviceHours > 0
			? pct(worst.supervisedHours, worst.serviceHours)
			: NO_FIGURE;

	if (worst.standing === 'unknown') {
		return {
			id: 'supervision',
			label: 'Supervision this month',
			detail: `Enter the hours you delivered and the ${req.monthlyPercent}% can be worked out · ${closes}${where}`,
			value,
			tone: 'unknown',
			note: 'not checked',
			href: '/tools/supervision'
		};
	}

	if (worst.standing === 'short') {
		const failing = worst.checks.filter((c) => c.met === false).map((c) => c.label);
		return {
			id: 'supervision',
			label: 'Supervision this month',
			detail: `Not met yet: ${failing.join(', ')} · ${closes}${where}`,
			value,
			tone: 'short',
			note: 'short',
			href: '/tools/supervision'
		};
	}

	return {
		id: 'supervision',
		label: 'Supervision this month',
		detail: `Needs ${req.monthlyPercent}%. Every monthly rule met · ${closes}${where}`,
		value,
		tone: 'neutral',
		note: null,
		href: '/tools/supervision'
	};
}

function developmentRow(inputs: RowInputs): Figure | null {
	const req = inputs.development;
	const summary = inputs.cycle;
	if (!req || !summary) return null;

	const days = summary.daysRemaining;
	const when =
		days < 0
			? 'the cycle has ended'
			: days === 0
				? 'the cycle ends today'
				: `${days} ${days === 1 ? 'day' : 'days'} left in the cycle`;

	/*
	 * Being under the total mid-cycle is not a problem — it is what the middle of a cycle
	 * looks like. `standing` goes short the moment `earned < required`, so mapping it
	 * straight onto a red "short" would flag a two-year cycle with sixteen months still to
	 * run, and a warning that fires when nothing is wrong is one people learn to ignore.
	 * The only fact worth colouring is a cycle that has ended still owing units: there is
	 * no grace period and nothing carries over, so that one cannot be recovered.
	 */
	const missedIt = summary.remaining > 0 && days < 0;

	/*
	 * A requirement that starts after this cycle ends is not something to count against.
	 * Showing "0 of 12" there would state a debt the reader does not owe.
	 */
	if (!summary.requirementApplies) {
		return {
			id: 'development',
			label: `${req.unitLabel}s recorded`,
			detail: `The ${req.unitsPerCycle}-${req.unitLabel} rule starts with cycles ending ${req.effectiveFrom}. This one is recorded, not scored.`,
			value: String(summary.earned),
			tone: 'unknown',
			note: 'not scored',
			href: '/tools/development'
		};
	}

	return {
		id: 'development',
		label: `${req.unitLabel}s this cycle`,
		detail:
			summary.remaining > 0
				? `${summary.remaining} still needed · ${when}`
				: `All in · ${when}`,
		value: `${summary.earned} of ${summary.required}`,
		tone: missedIt ? 'short' : 'neutral',
		note: missedIt ? 'cycle ended' : null,
		href: '/tools/development'
	};
}

/**
 * Ranked, then cut.
 *
 * Order is what the reader can least afford to have wrong today: a deadline with a date
 * on it outranks a study queue, and a study queue outranks a self-assessment. Four is the
 * cut because a fifth row pushes the first destination tile off a phone screen, and this
 * card is meant to be read before it is scrolled past.
 */
export const MAX_ROWS = 4;

export function cockpitRows(inputs: RowInputs): Figure[] {
	const rows: (Figure | null)[] = [supervisionRow(inputs), developmentRow(inputs)];

	if (inputs.dueCards > 0) {
		rows.push({
			id: 'due',
			label: 'Flashcards due',
			detail: 'Due cards first: a card reviewed late is a card half forgotten.',
			value: String(inputs.dueCards),
			tone: 'neutral',
			note: null,
			href: '/study'
		});
	}

	if (inputs.weakest) {
		rows.push({
			id: 'weakest',
			label: 'Weakest area',
			detail:
				inputs.weakestWeight === null
					? inputs.weakest.name
					: `${inputs.weakest.name} · worth ${inputs.weakestWeight}% of the paper`,
			value: `${Math.round(inputs.weakest.accuracy * 100)}%`,
			// Deliberately never "short". This is an accuracy on this app's own questions,
			// not a mark against a standard, and there is no threshold to fail.
			tone: 'neutral',
			note: null,
			href: '/plan'
		});
	}

	if (inputs.competency) {
		rows.push({
			id: 'competency',
			label: 'Competency tasks',
			detail: 'Ticked by you, not by an assessor.',
			value: `${inputs.competency.ready} of ${inputs.competency.total}`,
			tone: 'neutral',
			note: null,
			href: '/competency'
		});
	}

	return rows.filter((r): r is Figure => r !== null).slice(0, MAX_ROWS);
}
