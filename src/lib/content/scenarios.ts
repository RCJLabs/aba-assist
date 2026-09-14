import type { Scenario } from '@aba/content-schema';
import data from './generated/scenarios.json';

export const scenarios = Object.values(data as unknown as Record<string, Scenario>).sort(
	(a, b) => a.title.localeCompare(b.title)
);

export const scenarioById = (id: string): Scenario | undefined =>
	(data as unknown as Record<string, Scenario>)[id];

export const escalationScenarios = scenarios.filter((s) => s.kind === 'escalation-only');
export const guidanceScenarios = scenarios.filter((s) => s.kind === 'guidance');

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
