/**
 * Every prerendered route, in one list.
 *
 * Shared by the axe sweep and the reflow sweep so that adding a page cannot quietly opt
 * it out of either. They check different things — one that a screen reader can use the
 * page, the other that a 320px phone can see all of it — and both were meant to cover
 * every route from the start.
 */
export const ROUTES = [
	'/',
	'/glossary',
	'/glossary/negative-reinforcement',
	'/abbreviations',
	'/scenarios',
	'/scenarios/learner-is-injuring-themselves',
	'/scenarios/you-have-been-told-to-restrain-or-seclude-a-learner',
	'/scenarios/you-are-asked-to-work-outside-your-role',
	'/help',
	'/about',
	'/settings',
	'/exams',
	'/competency',
	'/exams/rbt-tco-3',
	'/exams/bcba-tco-6',
	'/exams/bcaba-tco-6',
	'/study',
	'/quiz',
	'/drills',
	'/drills/pairs',
	'/drills/data',
	'/drills/graph',
	'/plan',
	'/progress',
	'/ethics',
	'/ethics/gifts',
	'/tools',
	'/tools/supervision',
	'/tools/development',
	'/tools/notes',
	'/tools/timer',
	'/session',
	'/tools/fieldwork',
	'/graphs',
	'/review',
	'/graphs/anatomy-of-a-line-graph',
	'/graphs/a-multiple-baseline-across-behaviors'
] as const;
