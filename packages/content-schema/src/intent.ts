/**
 * Matching what somebody typed against how a situation is actually asked for.
 *
 * Ranking words against words is the wrong tool for this, and that is a measured result
 * rather than an assumption: a distinctive phrase from a worked example reaches its term,
 * and a sentence describing what is happening reaches nothing, because the corpus does not
 * contain the words people reach for under pressure. Bag-of-words scoring over a few
 * hundred documents also rewards many weak matches over one good one, so the more of the
 * situation somebody types, the worse the ranking gets.
 *
 * So this is not ranking. It is a lookup with authored keys, and it either hits or gets
 * out of the way.
 *
 * **Precision over recall, deliberately and asymmetrically.** A false match sends somebody
 * mid-incident to the wrong card, which is worse than anything this feature could be worth.
 * A miss costs nothing at all — the query falls through to the search that was already
 * there. So the rule is strict: every content word of the phrase has to be present. A
 * reader who types less than the phrase asks for gets no match and the ordinary results,
 * which is exactly today's behaviour.
 *
 * Lives in the Zod-free half of the package because the compiler and the browser both run
 * it. They have to: the build checks that no two situations claim the same words, and a
 * check that normalised text differently from the matcher would be verifying a question
 * nobody asked.
 */

/*
 * Words that carry no routing information.
 *
 * Pronouns are the load-bearing part. Somebody types "he is hitting his head" or "she
 * keeps hitting her head", and a phrase written either way answers half the readers who
 * need it. Dropping them entirely is what lets one authored phrase cover both.
 */
const STOPWORDS = new Set([
	'a',
	'an',
	'the',
	'and',
	'or',
	'but',
	'if',
	'then',
	'than',
	'that',
	'this',
	'these',
	'those',
	'is',
	'are',
	'was',
	'were',
	'be',
	'been',
	'being',
	'am',
	'do',
	'does',
	'did',
	'doing',
	'have',
	'has',
	'had',
	'can',
	'could',
	'will',
	'would',
	'should',
	'may',
	'might',
	'must',
	'to',
	'of',
	'in',
	'on',
	'at',
	'by',
	'for',
	'with',
	'from',
	'about',
	'into',
	'onto',
	'over',
	'under',
	'out',
	'up',
	'down',
	'off',
	'as',
	'so',
	'just',
	'very',
	'really',
	'some',
	'any',
	'all',
	'my',
	'me',
	'i',
	'we',
	'us',
	'our',
	'you',
	'your',
	'he',
	'him',
	'his',
	'she',
	'her',
	'hers',
	'they',
	'them',
	'their',
	'theirs',
	'it',
	'its',
	'himself',
	'herself',
	'themselves',
	'itself',
	'myself',
	'ourselves',
	'who',
	'what',
	'when',
	'where',
	'why',
	'how',
	'which',
	'there',
	'here',
	'now',
	'keep',
	'keeps',
	'kept',
	'get',
	'gets',
	'got',
	'go',
	'goes',
	'went',
	'one',
	'said',
	'say',
	'says',
	'tell',
	'tells',
	'told'
]);

/**
 * A crude stem, on purpose.
 *
 * Enough to join "hitting", "hits" and "hit", and nowhere near a real stemmer. The whole
 * matcher is an authored lookup, so the cost of missing a form is one phrase somebody has
 * to write out — and a clever stemmer that merged two words that should stay apart would
 * cost a great deal more.
 */
function stem(word: string): string {
	let w = word;
	if (w.length > 5 && w.endsWith('ing')) {
		w = w.slice(0, -3);
		// "hitting" -> "hitt" -> "hit". Without this the doubled consonant never matches
		// the bare verb, which is the commonest form people type.
		if (w.length > 2 && w.at(-1) === w.at(-2)) w = w.slice(0, -1);
	} else if (w.length > 4 && w.endsWith('ed')) {
		w = w.slice(0, -2);
		if (w.length > 2 && w.at(-1) === w.at(-2)) w = w.slice(0, -1);
	} else if (w.length > 4 && w.endsWith('es')) {
		w = w.slice(0, -2);
	} else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) {
		w = w.slice(0, -1);
	}
	return w;
}

/** The words that decide a match: lowercased, de-punctuated, stopped and stemmed. */
export function intentTokens(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.split(' ')
		.filter((w) => w.length > 0 && !STOPWORDS.has(w))
		.map(stem)
		.filter((w) => w.length > 1);
}

/**
 * The fewest content words a phrase may carry.
 *
 * One word is not a route, it is a category. "hitting" alone would claim every query about
 * aggression and every query about self-injury, and it would claim them confidently.
 */
export const MIN_INTENT_TOKENS = 2;

/** Whether a query asks for this phrase. Every content word of the phrase must be present. */
export function matchesIntent(query: string, phrase: string): boolean {
	const wanted = intentTokens(phrase);
	if (wanted.length < MIN_INTENT_TOKENS) return false;
	const got = new Set(intentTokens(query));
	return wanted.every((w) => got.has(w));
}

export interface IntentRoute {
	phrase: string;
	id: string;
	title: string;
	/** True where the route leads to a card that stops rather than advises. */
	escalate: boolean;
}

/**
 * The routes a query asks for, most specific first.
 *
 * More content words means a more specific claim on the query, so a phrase that matched on
 * four words outranks one that matched on two. Ties break on the phrase itself so the
 * order is the same on every render.
 *
 * Every match is returned rather than only the best. Two situations can both genuinely
 * apply — somebody hurt during an incident is also an incident — and picking one for the
 * reader would be the app making a clinical judgement it has no standing to make.
 */
export function routesFor(query: string, routes: readonly IntentRoute[]): IntentRoute[] {
	const hits = routes.filter((r) => matchesIntent(query, r.phrase));
	const byId = new Map<string, IntentRoute>();
	for (const hit of hits) {
		const existing = byId.get(hit.id);
		// One card, one row: a card with three phrases that all matched is still one answer.
		if (!existing || intentTokens(hit.phrase).length > intentTokens(existing.phrase).length) {
			byId.set(hit.id, hit);
		}
	}
	return [...byId.values()].sort(
		(a, b) =>
			intentTokens(b.phrase).length - intentTokens(a.phrase).length ||
			a.phrase.localeCompare(b.phrase)
	);
}
