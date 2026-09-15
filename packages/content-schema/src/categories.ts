/**
 * Term categories, as plain data.
 *
 * Split out of `term.ts` so the app can import the labels without importing Zod. The
 * schema package's barrel builds every schema at module scope, so one named import from
 * it drags the whole validation library into the browser bundle — which is a hundred
 * kilobytes of parser shipped to render a category heading.
 *
 * `term.ts` builds its enum from `CATEGORY_VALUES`, so there is still one list.
 */
export const CATEGORY_VALUES = [
	'philosophy',
	'principles',
	'measurement',
	'graphing',
	'assessment',
	'acquisition',
	'reduction',
	'verbal-behavior',
	'ethics',
	'supervision',
	'documentation',
	'research-design'
] as const;

export type TermCategory = (typeof CATEGORY_VALUES)[number];

/**
 * Human labels, here rather than in the app because the build needs them too — the
 * search index carries a rendered label on every row, and two copies of this map would
 * drift the moment a category was renamed.
 */
export const CATEGORY_LABELS: Record<TermCategory, string> = {
	philosophy: 'Philosophy',
	principles: 'Principles',
	measurement: 'Measurement',
	graphing: 'Graphing',
	assessment: 'Assessment',
	acquisition: 'Skill acquisition',
	reduction: 'Behavior reduction',
	'verbal-behavior': 'Verbal behavior',
	ethics: 'Ethics',
	supervision: 'Supervision',
	documentation: 'Documentation',
	'research-design': 'Research design'
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as TermCategory[];
