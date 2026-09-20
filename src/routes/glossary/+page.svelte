<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { onMount } from 'svelte';
	import { base, resolve } from '$app/paths';
	import { SITE_ORIGIN } from '$lib/config.js';
	import { definedTermSet } from '$lib/seo/meta.js';
	import ContentFilters from '$lib/components/ContentFilters.svelte';
	import LookupList from '$lib/components/LookupList.svelte';
	import { termsByCategory, CATEGORY_LABELS, termIndex } from '$lib/content/load.js';
	import { filters } from '$lib/state/filters.svelte.js';
	import { lookups } from '$lib/state/lookups.svelte.js';

	// One string, used by the description tag and by the structured data. Two copies of
	// the same sentence is how a page ends up describing itself two different ways.
	const DESCRIPTION =
		'Plain-language and technical definitions of applied behavior analysis terms, each with an example, a non-example, and its sources.';

	const visible = $derived(termIndex.filter((t) => filters.matches(t)));

	onMount(() => {
		void lookups.load();
	});

	/*
	 * Only terms, and only ones still in the corpus.
	 *
	 * This page already holds `termIndex`, so checking costs nothing here — which is the
	 * reason the filtering happens on this page rather than in the store. A row survives
	 * an entry being renamed, but an entry withdrawn between builds would leave a link to
	 * a page that no longer prerenders, and a dead link on the way back to something you
	 * read yesterday is worse than not offering the shortcut.
	 */
	// The index uses one-letter keys to keep the shipped JSON small; `i` is the id.
	const known = $derived(new Set(termIndex.map((t) => t.i)));
	const recentTerms = $derived(
		lookups.recent.filter((r) => r.kind === 'term' && known.has(r.slug)).slice(0, 5)
	);
	const grouped = $derived(termsByCategory(visible));
	const categories = $derived(
		[...grouped.keys()].sort((a, b) =>
			(CATEGORY_LABELS[a] ?? a).localeCompare(CATEGORY_LABELS[b] ?? b)
		)
	);
</script>

<Seo
	structured={definedTermSet({
		origin: SITE_ORIGIN,
		base,
		description: DESCRIPTION,
		count: termIndex.length
	})}
	title="Glossary"
	description={DESCRIPTION}
/>

<h1>Glossary</h1>
<p>
	{termIndex.length} terms. Every entry has a technical definition, a plain-language version, an
	example, a non-example, and the sources it was written from.
</p>

<p class="sideways">
	Holding an abbreviation rather than a word?
	<a href={resolve('/abbreviations')}>The abbreviation list</a> decodes them.
</p>

<ContentFilters label="Filter the glossary" />

<p class="count" aria-live="polite">
	{#if filters.active}
		Showing {visible.length} of {termIndex.length} terms
		{#if filters.describe()}— {filters.describe()}{/if}
	{:else}
		All {termIndex.length} terms
	{/if}
</p>

<!--
	The way back to what you were reading.

	Five, and only on this page. A reference app is opened mid-task and the thing somebody
	wants most often is the entry they had open twenty minutes ago, before a session
	interrupted them — which is otherwise reachable only by remembering the word and
	typing it again. It is hidden entirely until there is history, so a first visit is
	unchanged.
-->
{#if recentTerms.length > 0}
	<section class="recent" aria-labelledby="recent-h">
		<h2 id="recent-h" class="section-head">Back to what you were reading</h2>
		<LookupList rows={recentTerms} />
	</section>
{/if}

{#if visible.length === 0}
	<p class="empty">
		Nothing is tagged to that combination yet. Try a different domain or category, or
		<button type="button" class="link" onclick={() => filters.clear()}
			>clear the filters</button
		>.
	</p>
{/if}

<!--
	The way into 259 terms without scrolling through them.

	Twelve sections is a long page and the filters above only narrow it — they do not help
	somebody who knows they want measurement. These are ordinary fragment links, so they
	work before the bundle loads and with the keyboard for free, and the list follows the
	filter rather than offering a category that is currently empty.

	Closed by default, and measured rather than guessed: twelve targets at the 44px this
	app holds itself to is 296px at 390px wide and 397px at 320px — a third to half a
	phone screen, in front of the terms, for a control most visits do not use. A
	disclosure costs one row and one tap. The counts are the reason it exists at all; the
	filter above can already narrow to a category, but it cannot say how much is in each.
-->
{#if categories.length > 1}
	<details class="index" id="glossary-index">
		<summary>Jump to a category <span class="n">{categories.length}</span></summary>
		<!--
			Named "Categories" rather than repeating the summary. The landmark and the
			disclosure are two different things to announce, and "Jump to a category" in
			both places also made the nav collide with the Category filter above it for
			anything matching by label — including this app's own tests.
		-->
		<nav aria-label="Categories">
			<ul>
				{#each categories as c (c)}
					<li>
						<a href="#{c}">
							{CATEGORY_LABELS[c] ?? c}
							<span class="n">{grouped.get(c)?.length ?? 0}</span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</details>
{/if}

{#each categories as c (c)}
	<section id={c}>
		<!--
			Sticky, so the answer to "which category am I in" is always on screen during a
			long scroll, and the way back to the index costs no extra row. The link is
			beside the heading rather than inside it: an `h2` is the section's name, and
			"Assessment (19) Index" is not the name of anything.
		-->
		<div class="cat-head">
			<h2 class="section-head">
				{CATEGORY_LABELS[c] ?? c} <span class="n">({grouped.get(c)?.length ?? 0})</span>
			</h2>
			<a class="to-index" href="#glossary-index">Index</a>
		</div>
		<ul>
			{#each grouped.get(c) ?? [] as t (t.i)}
				<li>
					<a href={resolve('/glossary/[slug]', { slug: t.i })}>
						<span class="term">{t.t}</span>
						<span class="gloss">{t.g}</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/each}

<style>
	.sideways {
		margin: 0 0 1rem;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	h1 {
		font-size: 1.5rem;
	}

	/*
	 * The index. A wrapping row of chips rather than a list of rows: twelve rows is most
	 * of a phone screen spent on a thing nobody wants to read, and the label plus a count
	 * is short enough that three or four fit on a line.
	 */
	.index {
		margin: 0 0 1.5rem;
	}
	/*
	 * `display: flex` drops the default disclosure marker, so the chevron is drawn back
	 * explicitly — without it the summary reads as a line of text rather than a control.
	 */
	.index > summary {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
		font-size: 0.9rem;
		color: var(--link);
		list-style: none;
	}
	.index > summary::-webkit-details-marker {
		display: none;
	}
	.index > summary::after {
		content: '';
		width: 0.45rem;
		height: 0.45rem;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(45deg) translate(-2px, -2px);
		transition: transform 120ms ease-out;
	}
	.index[open] > summary::after {
		transform: rotate(-135deg) translate(-2px, -2px);
	}
	.index > summary .n {
		color: var(--text-muted);
	}
	.index ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
	}
	.index li {
		border: none;
	}
	.index a {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: var(--tap);
		padding: 0.3rem 0.55rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.8rem;
		text-decoration: none;
		color: var(--text);
	}
	.index .n {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	/*
	 * `main` is the scroll container, so this sticks to the top of the content area
	 * rather than to the viewport, which is where the header already is.
	 */
	.cat-head {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 2rem;
		padding-bottom: 0.35rem;
		border-bottom: 2px solid var(--border);
		background: var(--bg);
	}

	.to-index {
		flex: none;
		/*
		 * Padding rather than a 44px box: this rides along with a sticky heading on every
		 * section, and a full tap target there costs more room than it is worth. 2.5.8
		 * sets a 24px floor and the app's own sweep enforces it on every link.
		 */
		padding: 0.35rem 0.4rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	section {
		scroll-margin-top: 0.25rem;
	}

	.n {
		font-weight: 400;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.count {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.empty {
		background: var(--surface);
		padding: 0.75rem 1rem;
		border-radius: var(--radius);
	}

	.link {
		background: none;
		border: none;
		padding: 0;
		min-height: 0;
		min-width: 0;
		color: var(--link);
		text-decoration: underline;
		cursor: pointer;
		font: inherit;
	}

	ul {
		list-style: none;
		padding: 0;
	}

	li {
		border-bottom: 1px solid var(--border);
	}

	/*
	 * Scoped to the list rows rather than every link on the page.
	 *
	 * A bare `a` selector is still scoped to this component, which is not the same as
	 * scoped to the list: it also caught the one-sentence link above the filters and made
	 * it a 44px block, breaking that sentence across three lines. A row is a tap target
	 * and a link inside a sentence is not.
	 */
	li > a {
		display: block;
		padding: 0.75rem 0.25rem;
		min-height: var(--tap);
		text-decoration: none;
		color: var(--text);
	}

	.term {
		display: block;
		font-weight: 600;
		color: var(--link);
	}

	.gloss {
		display: block;
		font-size: 0.9rem;
		color: var(--text-muted);
	}
</style>
