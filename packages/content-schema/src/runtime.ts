/**
 * The Zod-free half of this package.
 *
 * Everything here is plain data or a plain function: category labels, the safety
 * lexicons, the MiniSearch configuration. The app imports from here rather than from the
 * barrel, because the barrel builds every schema at module scope — one named import from
 * it puts the whole validation library in the browser bundle, which a measured
 * Lighthouse run showed costing more than the content it was validating.
 *
 * Nothing in this file may import Zod, directly or through another module. A build that
 * breaks that rule shows up as a bundle that grows by a hundred kilobytes for no visible
 * reason, which is exactly the kind of regression the performance budget exists to catch.
 */
export {
	CATEGORY_LABELS,
	CATEGORY_ORDER,
	CATEGORY_VALUES,
	type TermCategory
} from './categories.js';
export {
	RISK_LEXICON,
	RESTRICTED_PROCEDURE_LEXICON,
	PHYSICAL_CONTACT_LEXICON,
	CLINICAL_DECISION_LEXICON
} from './lexicons.js';
export {
	SETTING_LABELS,
	SETTING_VALUES,
	settingLabel,
	type ExampleSetting
} from './settings.js';
export { SEARCH_FIELDS, searchOptions, type AbaSearchOptions } from './search-options.js';

/**
 * How a competency task may be assessed.
 *
 * Here rather than beside the schema for the same reason the category labels are: the
 * competency page renders these words, and importing them from a module that builds Zod
 * schemas at module scope would ship the whole validation library to render four labels.
 */
export const ASSESSMENT_METHODS = ['with-a-client', 'role-play', 'interview'] as const;
export type AssessmentMethod = (typeof ASSESSMENT_METHODS)[number];

export const METHOD_LABELS: Record<AssessmentMethod, string> = {
	'with-a-client': 'With a client',
	'role-play': 'Role-play',
	interview: 'Interview'
};

export {
	RELEASE_REQUIRED_KINDS,
	RELEASE_MINIMUM_TERMS,
	type ReleaseRequiredKind
} from './release.js';
