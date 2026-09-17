/**
 * Turning parked questions into an agenda.
 *
 * The problem this app was built around, stated in its own research: the technician to
 * analyst ratio moved from 2:1 to 3:1 between 2020 and 2025, and over forty per cent of
 * technicians report verbal feedback as their only supervision. "Ask your BCBA" is
 * increasingly not answerable in the moment, so the question has to survive until the
 * meeting — and the thing that kills it is not forgetting, it is arriving at the meeting
 * with nothing written down and spending the half hour on whatever comes to mind.
 *
 * So the ordering here is oldest first, everywhere, without exception. A question parked
 * three weeks ago is not stale; it is the one that has been bumped off the end of three
 * meetings in a row, and putting it under this week's fresher, more interesting one is how
 * it gets bumped off a fourth.
 */

import type { QuestionTopic, Supervisee, SupervisionQuestion } from '$lib/db/index.js';

/*
 * Re-exported so a component can name a topic without importing the database module, which
 * the lint rule forbids and should: everything else that reaches for `$lib/db` from a page
 * ends up writing to it.
 */
export type { QuestionTopic };

export const TOPIC_LABELS: Record<QuestionTopic, string> = {
	'the-plan': 'The plan',
	'a-procedure': 'A procedure',
	'data-and-measurement': 'Data and measurement',
	'a-reaction-i-did-not-expect': 'A reaction I did not expect',
	'scope-and-role': 'Scope and role',
	documentation: 'Documentation',
	'something-else': 'Something else'
};

export const TOPICS = Object.keys(TOPIC_LABELS) as QuestionTopic[];

/** How long a question has been waiting, in whole days. */
export const daysWaiting = (q: SupervisionQuestion, now: number): number =>
	Math.max(0, Math.floor((now - q.raisedAt) / 86_400_000));

/**
 * Questions still open, oldest first.
 *
 * Ties broken by id rather than left to the engine's sort stability, so two questions
 * parked in the same second come out in the same order on every render and the agenda a
 * reader printed matches the one still on screen.
 */
export function openQuestions(all: readonly SupervisionQuestion[]): SupervisionQuestion[] {
	return all
		.filter((q) => q.answeredAt === null)
		.sort((a, b) => a.raisedAt - b.raisedAt || a.id.localeCompare(b.id));
}

export interface AgendaGroup {
	/** The supervisee code, or null for the author's own questions. */
	code: string | null;
	questions: SupervisionQuestion[];
}

/**
 * The agenda, grouped by who it concerns.
 *
 * Grouped because a meeting runs that way — you work through one supervisee, then the
 * next — and the author's own questions come last rather than first: they are the ones
 * that can be asked in a corridor, and the ones about somebody else are why the meeting
 * has a time slot.
 */
export function agenda(
	all: readonly SupervisionQuestion[],
	supervisees: readonly Supervisee[]
): AgendaGroup[] {
	const codeOf = (id: string | null) =>
		id === null ? null : (supervisees.find((s) => s.id === id)?.code ?? null);

	const groups = new Map<string, AgendaGroup>();
	for (const q of openQuestions(all)) {
		const code = codeOf(q.superviseeId);
		/*
		 * A question whose supervisee has been deleted falls into the unattributed group
		 * rather than vanishing. The delete cascades, so this should not happen — but a
		 * restored backup is somebody else's file, and dropping a written question because
		 * a reference did not resolve is the one outcome worth ruling out.
		 */
		const key = code ?? '';
		const found = groups.get(key);
		if (found) found.questions.push(q);
		else groups.set(key, { code, questions: [q] });
	}

	return [...groups.values()].sort((a, b) => {
		if (a.code === null) return 1;
		if (b.code === null) return -1;
		return a.code.localeCompare(b.code);
	});
}

export interface AgendaSummary {
	open: number;
	/** The longest any open question has been waiting, in days. */
	oldestDays: number;
	/** Open questions that have been waiting longer than a fortnight. */
	overdue: number;
	answeredEver: number;
}

/**
 * A fortnight, because that is the shortest supervision cycle this app models.
 *
 * Not a deadline and not presented as one: nothing here is a requirement, and a question
 * that has waited three weeks is a fact about how often the meeting happens rather than a
 * failure by the person who parked it.
 */
export const WAITING_TOO_LONG_DAYS = 14;

export function summarise(all: readonly SupervisionQuestion[], now: number): AgendaSummary {
	const open = openQuestions(all);
	const waits = open.map((q) => daysWaiting(q, now));
	return {
		open: open.length,
		oldestDays: waits.length > 0 ? Math.max(...waits) : 0,
		overdue: waits.filter((d) => d >= WAITING_TOO_LONG_DAYS).length,
		answeredEver: all.length - open.length
	};
}
