<script lang="ts">
	import { resolve } from '$app/paths';
	import ContentFilters from '$lib/components/ContentFilters.svelte';
	import { termsByCategory, CATEGORY_LABELS, termIndex } from '$lib/content/load.js';
	import { filters } from '$lib/state/filters.svelte.js';

	const visible = $derived(termIndex.filter((t) => filters.matches(t)));
	const grouped = $derived(termsByCategory(visible));
	const categories = $derived(
		[...grouped.keys()].sort((a, b) =>
			(CATEGORY_LABELS[a] ?? a).localeCompare(CATEGORY_LABELS[b] ?? b)
		)
	);
</script>

<svelte:head>
	<title>Glossary — ABA Assist</title>
	<meta
		name="description"
		content="Plain-language and technical definitions of applied behavior analysis terms, each with an example, a non-example, and its sources."
	/>
</svelte:head>

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

{#if visible.length === 0}
	<p class="empty">
		Nothing is tagged to that combination yet. Try a different domain or category, or
		<button type="button" class="link" onclick={() => filters.clear()}
			>clear the filters</button
		>.
	</p>
{/if}

{#each categories as c (c)}
	<section id={c}>
		<h2>{CATEGORY_LABELS[c] ?? c} <span class="n">({grouped.get(c)?.length ?? 0})</span></h2>
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

	h2 {
		font-size: 1.1rem;
		margin-top: 2rem;
		padding-bottom: 0.25rem;
		border-bottom: 2px solid var(--border);
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
