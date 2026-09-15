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
	CLINICAL_DECISION_LEXICON
} from './lexicons.js';
export { SEARCH_FIELDS, searchOptions, type AbaSearchOptions } from './search-options.js';
