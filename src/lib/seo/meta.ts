/**
 * Absolute URLs and structured data, for the two audiences that never open the app.
 *
 * A search engine and a chat client both read the page before any human does, and both
 * were being handed nothing: no `og:` tags anywhere in the source, no JSON-LD, no
 * canonical link. Pasting a term into a work group chat produced a bare URL, and a
 * glossary — the one content shape search engines have a dedicated vocabulary for —
 * described itself as ordinary prose.
 *
 * Everything here is pure and takes the origin as an argument. That is not ceremony: the
 * origin is a build-time constant substituted by Vite, and a function that reached for it
 * directly could not be tested against the case that actually matters, which is the app
 * being served from a project subdirectory today and an origin root later.
 */

/** A title, ready for `<title>` and `og:title`. */
export interface PageMeta {
	title: string;
	description: string;
	canonical: string;
	image: string;
}

export const SITE_NAME = 'ABA Assist';

/**
 * The longest a description may be before it is cut.
 *
 * Search results and chat previews both truncate somewhere near here, and a sentence
 * clipped by somebody else's renderer reads as a bug in the page. Cut deliberately, on a
 * word, with an ellipsis that says it was cut.
 */
export const MAX_DESCRIPTION = 160;

/**
 * Join an origin, a base path and a route into one absolute URL.
 *
 * Fiddly enough to be worth its own function and its own tests. The base path is '' on a
 * custom domain and '/aba-assist' on the project site, the route always begins with '/',
 * and the naive concatenation produces a double slash in one case and a missing one in
 * the other — neither of which is visible until a canonical link is already published
 * pointing at a page that does not exist.
 */
export function absoluteUrl(origin: string, base: string, path: string): string {
	const root = origin.replace(/\/+$/, '');
	const prefix = base.replace(/\/+$/, '');
	const route = path.startsWith('/') ? path : `/${path}`;
	// The home route is the one case where the trailing slash matters: `…/aba-assist` and
	// `…/aba-assist/` are the same page, and Pages serves the second. Anything deeper is
	// served without one.
	const joined = route === '/' ? `${root}${prefix}/` : `${root}${prefix}${route}`;
	return joined;
}

/** Cut on a word boundary rather than mid-syllable, and say that it was cut. */
export function clamp(text: string, max = MAX_DESCRIPTION): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	if (flat.length <= max) return flat;
	// One character of room for the ellipsis, which is a single glyph.
	const cut = flat.slice(0, max - 1);
	/*
	 * If the character the cut fell on is itself a space then `cut` already ends on a word
	 * and trimming back to the previous space would throw away a whole word for nothing.
	 * Rare, but it is exactly the case that makes a clamped description read as careless.
	 */
	const cleanBreak = /\s/.test(flat[max - 1] ?? '');
	const lastSpace = cut.lastIndexOf(' ');
	// A break past halfway is a word boundary worth using; one before it means a single
	// long word, where a hard cut beats losing the sentence.
	const kept = cleanBreak || lastSpace <= max / 2 ? cut : cut.slice(0, lastSpace);
	return `${kept.replace(/[,;:.\s]+$/, '')}…`;
}

/**
 * A `DefinedTerm`, which is what a glossary entry actually is.
 *
 * Schema.org has a vocabulary for exactly this shape and the content model already
 * carries every field it wants, so the markup is a translation rather than an invention.
 * `termCode` is the slug, which is also the fragment other entries link to.
 *
 * Deliberately omitted: anything the page does not say. No `author` (the entries are
 * unsigned until a human reviewer has approved them), no `datePublished` that would imply
 * an editorial date the content files do not carry, and no aggregate rating of any kind.
 * Structured data that overstates the page is worse than none — it is the kind of thing
 * that gets a site's rich results turned off.
 */
export function definedTerm(args: {
	origin: string;
	base: string;
	id: string;
	term: string;
	description: string;
	aliases: readonly string[];
}): Record<string, unknown> {
	const { origin, base, id, term, description, aliases } = args;
	const url = absoluteUrl(origin, base, `/glossary/${id}`);
	return {
		'@context': 'https://schema.org',
		'@type': 'DefinedTerm',
		'@id': url,
		name: term,
		description: clamp(description),
		termCode: id,
		url,
		...(aliases.length ? { alternateName: [...aliases] } : {}),
		inDefinedTermSet: {
			'@type': 'DefinedTermSet',
			name: `${SITE_NAME} glossary`,
			url: absoluteUrl(origin, base, '/glossary')
		}
	};
}

/**
 * The set itself, for the index page.
 *
 * `hasDefinedTerm` is left out rather than filled with 259 entries. It is allowed, and it
 * would add well over a hundred kilobytes of JSON to a page whose own HTML is smaller
 * than that — on a phone, for a machine-readable duplicate of the list already rendered
 * below it. Each term page carries its own `DefinedTerm` pointing back here, which is the
 * same graph described from the other end and costs nothing.
 */
export function definedTermSet(args: {
	origin: string;
	base: string;
	description: string;
	count: number;
}): Record<string, unknown> {
	const { origin, base, description, count } = args;
	return {
		'@context': 'https://schema.org',
		'@type': 'DefinedTermSet',
		'@id': absoluteUrl(origin, base, '/glossary'),
		name: `${SITE_NAME} glossary`,
		description: clamp(description),
		url: absoluteUrl(origin, base, '/glossary'),
		numberOfItems: count,
		inLanguage: 'en'
	};
}

/**
 * The site, on the home page only.
 *
 * No `SearchAction`. The obvious thing to add is a sitelinks search box pointing at the
 * app's own search, and it would be a lie on this build: search runs entirely in the
 * browser against a downloaded index, so there is no URL a search engine could send
 * somebody to with a query in it.
 */
export function webSite(args: { origin: string; base: string; description: string }) {
	const { origin, base, description } = args;
	const url = absoluteUrl(origin, base, '/');
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		'@id': url,
		name: SITE_NAME,
		description: clamp(description),
		url,
		inLanguage: 'en'
	};
}
