/**
 * The credential facts, on their own.
 *
 * Split out of `corpus.ts` for the same reason `corpus.ts` was split out of `load.ts`,
 * one level down: importing one thing from a barrel pulls everything the barrel imports.
 * `corpus.ts` bundles the ethics codes, every ethics topic, the graphs, the practice
 * guides and the competency assessment into one module, and the tracker — which needs
 * nothing from it but the monthly supervision percentages and the cycle lengths — was
 * dragging all of it onto `/tools`. Two hundred and thirty-four kilobytes of script to
 * read a handful of numbers, on the heaviest route in the app.
 *
 * That route was already the slowest, and it eventually crossed the first-contentful-paint
 * budget by eight milliseconds and blocked a deploy. The budget was right; the import was
 * the problem.
 *
 * So this file imports one JSON file and nothing else, and everything that needs only the
 * credential facts imports it rather than the barrel. `corpus.ts` re-exports these so the
 * pages that genuinely want the whole corpus are unchanged.
 *
 * The rule this follows, which is worth stating because it is easy to undo by accident:
 * **a module that imports data may not also be the convenient place to import types or
 * helpers from.** One import of a label constant is enough to attach the whole graph.
 */
import type { CredentialFacts } from '@aba/content-schema';
import credentialData from './generated/credentials.json';

export const credentials = credentialData as unknown as Record<string, CredentialFacts>;

export function credentialFacts(credential: string): CredentialFacts | undefined {
	return credentials[credential.toLowerCase()];
}

/**
 * The full names, kept here rather than in the barrel.
 *
 * Three strings, but they were in `corpus.ts`, and `/quiz` imported them — which is to
 * say `/quiz` was loading the ethics codes to render three headings.
 */
export const CREDENTIAL_LABELS: Record<string, string> = {
	RBT: 'Registered Behavior Technician',
	BCaBA: 'Board Certified Assistant Behavior Analyst',
	BCBA: 'Board Certified Behavior Analyst'
};
