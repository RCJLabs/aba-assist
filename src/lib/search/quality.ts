/**
 * A measured set of realistic queries, and what each one ought to reach.
 *
 * Search had no measure at all. The only query-level tests in the repo are the escalation
 * intent routes, and those exist *because* ranking was measured once and found unable to
 * answer the queries that matter — a finding that would have been invisible without
 * someone sitting down and typing. Everything since has been changed on the strength of
 * reading the code.
 *
 * This is the ratchet the coverage counters already are, pointed at retrieval: a fixed set
 * of queries, an expected answer for each, and a floor the suite refuses to fall below.
 * It cannot say search is good. It can say that a change made it worse, which is the
 * thing nobody could tell before.
 *
 * **The rule for adding to this set: write the query first and take the result you get.**
 * A query added because it already passes measures nothing. Several of the ones below do
 * not pass, and they are kept rather than quietly deleted — a set tuned until it is green
 * is a decoration, and the failures are the part that says what to work on.
 */

/** An acceptable answer is any one of these ids. */
export type Target = string | readonly string[];

export interface SearchExpectation {
	query: string;
	/** What a reader typing this is looking for. */
	expect: Target;
	/** How far down the list still counts as finding it. */
	within?: number;
	/** Ids that must not appear at all: a confident wrong answer is worse than none. */
	absent?: readonly string[];
}

/** The default depth. Three is about what fits on a phone before scrolling. */
export const DEFAULT_WITHIN = 3;

/*
 * The word itself.
 *
 * The floor of the whole thing. Somebody who knows the term and wants the definition is
 * the commonest search there is, and anything less than first place here is a bug.
 */
const EXACT: SearchExpectation[] = [
	{ query: 'motivating operation', expect: 'motivating-operation', within: 1 },
	{ query: 'negative reinforcement', expect: 'negative-reinforcement', within: 1 },
	{ query: 'discriminative stimulus', expect: 'discriminative-stimulus', within: 1 },
	{ query: 'task analysis', expect: 'task-analysis', within: 1 },
	{ query: 'token economy', expect: 'token-economy', within: 1 },
	{ query: 'backward chaining', expect: 'backward-chaining', within: 1 },
	{ query: 'premack principle', expect: 'premack-principle', within: 1 },
	{ query: 'interobserver agreement', expect: 'interobserver-agreement', within: 1 },
	{ query: 'extinction burst', expect: 'extinction-burst', within: 1 },
	{ query: 'momentary time sampling', expect: 'momentary-time-sampling', within: 1 }
];

/*
 * Abbreviations, which is how this field actually talks.
 *
 * A technician reads "run a DRA" in a plan and needs the words behind it. The aliases are
 * authored on the terms and boosted above the body, so these ought to be reliable.
 */
const ABBREVIATIONS: SearchExpectation[] = [
	{ query: 'MO', expect: 'motivating-operation' },
	{ query: 'DRA', expect: 'differential-reinforcement-of-alternative-behavior' },
	{ query: 'FBA', expect: 'functional-behavior-assessment' },
	{ query: 'IOA', expect: 'interobserver-agreement' },
	{ query: 'DTT', expect: 'discrete-trial-training' },
	{ query: 'ABC data', expect: 'abc-recording' },
	{ query: 'MTS', expect: 'momentary-time-sampling' },
	{ query: 'SD', expect: 'discriminative-stimulus' }
];

/*
 * Typed wrong, which is most of how anybody types on a phone between sessions.
 *
 * MiniSearch is configured with a small fuzzy distance; this is what that setting buys.
 */
const MISSPELLINGS: SearchExpectation[] = [
	{ query: 'extinciton', expect: 'extinction' },
	{ query: 'shapping', expect: 'shaping' },
	{ query: 'reinforcment', expect: ['positive-reinforcement', 'negative-reinforcement'] },
	{ query: 'generalisation', expect: 'generalization' },
	{ query: 'satiaton', expect: 'satiation' }
];

/*
 * Half a word, because search runs on every keystroke and the reader stops as soon as
 * they see what they wanted.
 */
const PREFIXES: SearchExpectation[] = [
	{ query: 'momentar', expect: 'momentary-time-sampling' },
	{ query: 'overcorrect', expect: 'overcorrection' },
	{ query: 'interrespon', expect: 'interresponse-time' },
	{ query: 'errorles', expect: 'errorless-teaching' },
	/*
	 * Stopped several letters short, which is the part the four above do not actually
	 * test: they are close enough to the whole word that the fuzzy setting rescues them
	 * even with prefix matching switched off. These are too far short for that, so they
	 * fail if prefix matching ever goes — measured by switching it off and watching.
	 */
	{
		query: 'reinforc',
		expect: ['positive-reinforcement', 'negative-reinforcement'],
		within: 5
	},
	{ query: 'generaliz', expect: 'generalization' },
	{ query: 'discrimin', expect: ['discrimination-training', 'discriminative-stimulus'] }
];

/*
 * Asked as a question, which is what a search box invites.
 *
 * The function words are noise the index has to survive rather than drown in.
 */
const QUESTIONS: SearchExpectation[] = [
	{ query: 'what is a motivating operation', expect: 'motivating-operation' },
	{ query: 'how do I fade prompts', expect: ['prompt-fading', 'prompt-hierarchy'] },
	{ query: 'what does extinction burst mean', expect: 'extinction-burst' },
	{
		query: 'difference between mand and tact',
		expect: ['mand', 'tact'],
		within: 5
	}
];

/*
 * Ethics and situations, which are the half of this corpus that is not a glossary.
 *
 * A reader looking for what to do about a gift should not have to know whether the app
 * files that under a principle or a situation, so either is a hit.
 */
const GUIDANCE: SearchExpectation[] = [
	{ query: 'gifts from a family', expect: ['gifts', 'a-family-offers-you-a-gift'] },
	// The glossary entry and the ethics topic are both right answers here, and the reader
	// does not care which file it came out of.
	{ query: 'dual relationship', expect: ['dual-relationship', 'multiple-relationships'] },
	{ query: 'mandated reporting', expect: 'mandated-reporting' },
	{ query: 'confidentiality', expect: 'confidentiality-and-records' },
	{
		query: 'restraint',
		expect: ['restrictive-procedures', 'you-have-been-told-to-restrain-or-seclude-a-learner']
	},
	{
		query: 'supervision hours',
		expect: [
			'supervision',
			'individual-supervision',
			'working-under-supervision',
			'what-good-supervision-looks-like'
		]
	},
	{
		query: 'caregiver asks about medication',
		expect: 'a-caregiver-asks-you-about-medication'
	},
	{ query: 'forgot to record data', expect: 'you-forgot-to-record-data' }
];

/*
 * Described rather than named, which is the hard class and the one that matters most on
 * the job — you can only search for the word if you already have it.
 *
 * Two of these are claims the index's own configuration makes in writing: indexing worked
 * examples was supposed to let somebody who remembers what the thing looked like find the
 * word for it. The rest are the ordinary case, and they are here to be measured rather
 * than because they are expected to pass. Escalation queries are deliberately absent:
 * those are answered by the authored intent routes, which have their own tests, and are
 * not this index's job.
 */
const DESCRIBED: SearchExpectation[] = [
	{ query: 'teach the last step first', expect: ['backward-chaining', 'chaining'], within: 5 },
	/*
	 * Known failures, kept on purpose. Deleting a query because it is red turns the set
	 * into a decoration; these are the record of what search cannot currently do.
	 *
	 * The first is the most interesting, because it is not a hard query — "prompt fading"
	 * on its own is answered instantly. Wrapping it in "how do I" buries the term under
	 * six situations, because the function words match situation prose and there is a lot
	 * more of that than there is of a definition. Stripping them from the query was tried
	 * and did not rescue it; a real fix is a ranking change, and now there is a measure to
	 * make one against.
	 */
	{
		query: 'how long after the instruction they start',
		expect: ['latency', 'time-delay'],
		within: 5
	},
	{
		query: 'giving them a break when they hit',
		expect: ['negative-reinforcement'],
		within: 5
	},
	{
		query: 'they only do it when I am in the room',
		expect: ['stimulus-control', 'discriminative-stimulus'],
		within: 5
	},
	{
		query: 'it got worse before it got better',
		expect: ['extinction-burst'],
		within: 5
	},
	{
		query: 'counting how many times it happens',
		expect: ['count', 'frequency-and-rate'],
		within: 5
	}
];

export const QUERY_SET: readonly SearchExpectation[] = [
	...EXACT,
	...ABBREVIATIONS,
	...MISSPELLINGS,
	...PREFIXES,
	...QUESTIONS,
	...GUIDANCE,
	...DESCRIBED
];

export interface QueryOutcome {
	query: string;
	/** Where the expected answer landed, or null if it was not in the results at all. */
	rank: number | null;
	passed: boolean;
	/** Ids that were supposed to be absent and were not. */
	forbidden: string[];
	/** The top few, for reading a failure without re-running anything. */
	top: string[];
}

export interface QualityReport {
	outcomes: QueryOutcome[];
	passed: number;
	total: number;
	failures: QueryOutcome[];
	/**
	 * Mean reciprocal rank: the average of 1/rank, counting a miss as zero.
	 *
	 * Carried alongside the pass count because the pass count on its own turned out to be
	 * a poor ratchet, and that was measured rather than assumed — deleting every field
	 * boost from the index configuration, which is about as large a ranking regression as
	 * this app could suffer, moved it by a single query. Most of the set is exact term
	 * names, and those win on a title match whatever the weighting does.
	 *
	 * Reciprocal rank moves continuously instead. An answer that slips from first to third
	 * still passes, and still registers, which is what makes this worth ratcheting on.
	 */
	mrr: number;
}

const targets = (t: Target): readonly string[] => (typeof t === 'string' ? [t] : t);

/**
 * Run the set against a search function and say what happened.
 *
 * `search` takes a query and returns document ids in rank order — the same list the page
 * renders, so the measurement is of what a reader actually sees rather than of a scoring
 * function in isolation.
 */
export function evaluate(
	set: readonly SearchExpectation[],
	search: (query: string) => readonly string[]
): QualityReport {
	const outcomes = set.map((e): QueryOutcome => {
		const results = search(e.query);
		const within = e.within ?? DEFAULT_WITHIN;
		const wanted = targets(e.expect);
		const found = results.findIndex((id) => wanted.includes(id));
		const rank = found === -1 ? null : found + 1;
		const forbidden = (e.absent ?? []).filter((id) => results.includes(id));
		return {
			query: e.query,
			rank,
			passed: rank !== null && rank <= within && forbidden.length === 0,
			forbidden,
			top: results.slice(0, 5)
		};
	});
	const failures = outcomes.filter((o) => !o.passed);
	const reciprocal = outcomes.reduce((sum, o) => sum + (o.rank ? 1 / o.rank : 0), 0);
	return {
		outcomes,
		passed: outcomes.length - failures.length,
		total: outcomes.length,
		failures,
		mrr: outcomes.length === 0 ? 0 : reciprocal / outcomes.length
	};
}

/** A failure, written so that reading the test output is enough to act on it. */
export function describeFailure(o: QueryOutcome): string {
	const where = o.rank === null ? 'not in the results' : `at ${o.rank}`;
	const bad = o.forbidden.length > 0 ? `, forbidden: ${o.forbidden.join(', ')}` : '';
	return `"${o.query}" — ${where}${bad}; top: ${o.top.join(', ') || '(none)'}`;
}
