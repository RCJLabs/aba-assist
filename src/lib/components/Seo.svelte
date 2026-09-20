<script lang="ts">
	/**
	 * Everything in the head that is not for the reader.
	 *
	 * One component rather than tags spread through 34 pages, because `<svelte:head>` does
	 * not deduplicate: a default set in the layout plus an override on the page gives two
	 * `og:title` tags, and which one a scraper picks is not something this app gets to
	 * decide. So every page that has a title renders this instead of writing its own, and
	 * the tags exist exactly once.
	 *
	 * `structured` is passed already built rather than assembled here. The JSON-LD shapes
	 * are pure functions with tests of their own, and a component is the one place in this
	 * codebase they could not be tested from.
	 */
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { SITE_NAME, absoluteUrl, clamp } from '$lib/seo/meta.js';
	import { SITE_ORIGIN } from '$lib/config.js';

	let {
		title,
		description,
		/** Overrides the current route. Only needed where a page is canonically elsewhere. */
		path = null,
		/** `article` for a single content entry, `website` for an index or a tool. */
		type = 'website',
		/** Kept out of search results. The reviewer queue is not a page for readers. */
		noindex = false,
		structured = null
	}: {
		title: string;
		description: string;
		path?: string | null;
		type?: 'website' | 'article';
		noindex?: boolean;
		structured?: Record<string, unknown> | null;
	} = $props();

	/*
	 * The route, not the visited URL. `page.url.pathname` carries the base path already
	 * and, during prerendering, an origin of `http://sveltekit-prerender` — so the path is
	 * taken from it with the base stripped, and the origin comes from the build constant.
	 */
	const route = $derived(
		path ??
			(base && page.url.pathname.startsWith(base)
				? page.url.pathname.slice(base.length) || '/'
				: page.url.pathname)
	);
	const canonical = $derived(absoluteUrl(SITE_ORIGIN, base, route));
	/*
	 * The suffix is added here so 34 pages do not each remember to. A title that already
	 * names the app keeps what it has: the home page's title is a whole descriptive
	 * sentence built around the name, and appending to it would read as a stutter.
	 */
	const full = $derived(title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`);
	const short = $derived(clamp(description));
	const image = $derived(absoluteUrl(SITE_ORIGIN, base, '/og.png'));

	/*
	 * Built here rather than in the markup, for two separate reasons.
	 *
	 * Correctness: a closing script tag appearing inside a JSON string value would end the
	 * element early and leave the rest of the graph on the page as markup. Escaping every
	 * `<` is cheaper and more certain than reasoning about which content fields could ever
	 * contain one, and a JSON parser reads the escape back as `<`.
	 *
	 * Parsing: `</` inside an expression in the markup section reads as the start of a
	 * closing tag to the Svelte parser, so the regex could not live there at all.
	 */
	const json = $derived(
		structured ? JSON.stringify(structured).replace(/</g, '\\u003c') : null
	);
	/*
	 * The closing tag is split rather than escaped. `<\/script>` says the same thing and
	 * reads better, but nothing in the toolchain believes the backslash is load-bearing —
	 * ESLint calls it a useless escape — and silencing that rule to keep one character is
	 * a worse trade than a concatenation that no parser can misread.
	 */
	const OPEN = '<script type="application/ld+json">';
	const CLOSE = '</' + 'script>';
	const ldTag = $derived(json === null ? null : OPEN + json + CLOSE);
</script>

<svelte:head>
	<title>{full}</title>
	<meta name="description" content={short} />
	<link rel="canonical" href={canonical} />
	{#if noindex}
		<meta name="robots" content="noindex" />
	{/if}

	<meta property="og:type" content={type} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={full} />
	<meta property="og:description" content={short} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={image} />
	<!--
		Stated because a scraper that cannot fetch the image still has to lay out a card,
		and one that has to guess leaves a gap that reflows when the image arrives.
	-->
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta
		property="og:image:alt"
		content="ABA Assist — a free, offline reference for ABA work"
	/>
	<meta property="og:locale" content="en_US" />

	<!--
		`summary_large_image` rather than `summary`. The card is 1200x630 and the small
		variant would letterbox it into a square thumbnail. Twitter's tags are read by more
		than Twitter — several chat clients prefer them over Open Graph.
	-->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={full} />
	<meta name="twitter:description" content={short} />
	<meta name="twitter:image" content={image} />

	{#if ldTag}
		<!--
			The one `@html` in the app, and the rule is right to ask. What it renders is not
			reader input and never passes through storage: it is `JSON.stringify` of an
			object this app built from content that has already been through the schema, and
			every `<` in it has been escaped, so no value can close the element or open a
			tag. A script element cannot be produced any other way in Svelte.
		-->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html ldTag}
	{/if}
</svelte:head>
