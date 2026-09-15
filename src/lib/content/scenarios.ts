import type { Scenario } from '@aba/content-schema';
import data from './generated/scenarios.json';

export const scenarios = Object.values(data as unknown as Record<string, Scenario>).sort(
	(a, b) => a.title.localeCompare(b.title)
);

export const scenarioById = (id: string): Scenario | undefined =>
	(data as unknown as Record<string, Scenario>)[id];

/**
 * Escalation cards, most urgent first.
 *
 * Alphabetical was fine at seven cards and is not at twelve: this page gets opened
 * one-handed while something is happening, and the cards that route to emergency services
 * must not be below the fold behind a card about a medication question. Within each band
 * the order stays alphabetical so a card does not move around between builds.
 */
const IMMEDIATE = new Set(['emergency-services-911', 'crisis-line-988']);

export const escalationScenarios = scenarios
	.filter((s) => s.kind === 'escalation-only')
	.sort((a, b) => {
		const urgency = (s: Scenario) =>
			s.kind === 'escalation-only' && s.escalation.contacts.some((c) => IMMEDIATE.has(c))
				? 0
				: 1;
		return urgency(a) - urgency(b) || a.title.localeCompare(b.title);
	});

export const guidanceScenarios = scenarios.filter((s) => s.kind === 'guidance');

/**
 * Everyday situations, grouped by what the reader is dealing with.
 *
 * A flat list of two dozen titles is a list nobody reads to the end of. The groups come
 * from tags the content already carries rather than a new field, so adding a situation
 * files itself; `match` is first-wins in the order declared below, and anything that
 * matches nothing lands in the session bucket, which is where most situations belong.
 */
const GROUPS: { id: string; title: string; match: readonly string[] }[] = [
	{ id: 'school', title: 'At school', match: ['school', 'paraeducator'] },
	{
		id: 'families',
		title: 'Families, boundaries and privacy',
		match: ['caregivers', 'boundaries', 'confidentiality', 'community', 'consent']
	},
	{
		id: 'records',
		title: 'Records and paperwork',
		match: ['documentation', 'billing', 'integrity', 'honesty']
	},
	{
		id: 'supervision',
		title: 'Your supervisor, and what is yours to decide',
		match: ['supervision', 'scope-of-practice', 'workplace', 'compliance']
	},
	{ id: 'session', title: 'In the session', match: [] }
];

export interface ScenarioGroup {
	id: string;
	title: string;
	scenarios: Scenario[];
}

export const guidanceGroups: ScenarioGroup[] = (() => {
	const buckets = new Map(GROUPS.map((g) => [g.id, [] as Scenario[]]));
	for (const s of guidanceScenarios) {
		const group =
			GROUPS.find((g) => g.match.some((t) => s.tags.includes(t))) ?? GROUPS.at(-1)!;
		buckets.get(group.id)!.push(s);
	}
	// The session bucket leads: it is what somebody between two sessions is looking for.
	const order = ['session', 'families', 'supervision', 'records', 'school'];
	return order
		.map((id) => {
			const g = GROUPS.find((x) => x.id === id)!;
			return { id, title: g.title, scenarios: buckets.get(id)! };
		})
		.filter((g) => g.scenarios.length > 0);
})();

/** Human-readable labels. The enum values are stable ids; these are what a reader sees. */
export const CONTACT_LABELS: Record<string, string> = {
	'emergency-services-911': 'Emergency services (911)',
	'crisis-line-988': 'Suicide & Crisis Lifeline (988)',
	'supervising-bcba': 'Your supervising BCBA',
	'site-supervisor': 'Your site supervisor',
	'parent-guardian': 'Parent or guardian',
	'school-administrator': 'School administrator',
	'nurse-or-medical': 'Nurse or medical staff',
	'child-protective-services': 'Child protective services',
	'adult-protective-services': 'Adult protective services',
	'agency-safety-officer': 'Your agency safety officer'
};

export const RISK_LABELS: Record<string, string> = {
	restraint: 'Restraint',
	seclusion: 'Seclusion',
	'self-injury': 'Self-injury',
	'medical-emergency': 'Medical emergency',
	'suspected-abuse': 'Suspected abuse',
	'aggression-with-injury': 'Aggression causing injury',
	'elopement-into-danger': 'Leaving into danger',
	'suicidal-ideation': 'Suicidal statements',
	'medication-question': 'Medication question',
	'property-destruction-danger': 'Unsafe property destruction',
	weapon: 'Weapon'
};

/** Contacts that should be visually marked as immediate. */
export const IMMEDIATE_CONTACTS = new Set(['emergency-services-911', 'crisis-line-988']);
