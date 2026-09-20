<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { resolve } from '$app/paths';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { CATEGORY_LABELS } from '$lib/content/load.js';
	import { byLetter, filterAbbreviations } from '$lib/content/acronyms.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let query = $state('');
	const matches = $derived(filterAbbreviations(data.abbreviations, query));
	const groups = $derived(byLetter(matches));

	let lastAnnounced = -1;
	$effect(() => {
		const n = matches.length;
		if (query.trim() === '' || n === lastAnnounced) return;
		lastAnnounced = n;
		announcer.announce(`${n} ${n === 1 ? 'abbreviation' : 'abbreviations'}`);
	});
</script>

<Seo
	title="Abbreviations"
	description="What the abbreviations in applied behavior analysis stand for: MO, SD, DRO, MSWO, FCT, IOA and the rest, each linked to the full entry. Works offline."
/>

<h1>Abbreviations</h1>
<p class="lede">
	Somebody says the plan is on an MSWO and a DRO and you have three seconds to nod. Every
	abbreviation here is linked to the entry that explains it.
</p>

<search>
	<label class="field">
		<span>Find an abbreviation</span>
		<input
			type="search"
			bind:value={query}
			placeholder="DRO, or the words you remember"
			autocomplete="off"
			autocapitalize="characters"
			spellcheck="false"
		/>
	</label>
</search>

<p class="count" aria-live="polite">
	{matches.length} of {data.abbreviations.length} shown
</p>

{#if matches.length === 0}
	<p class="empty">
		Nothing here matches <strong>{query}</strong>. This list covers the abbreviations used in
		this app's glossary, so it will not have everything — try
		<a href={resolve('/glossary')}>the glossary</a> instead.
	</p>
{/if}

{#each groups as group (group.letter)}
	<section aria-labelledby="letter-{group.letter}">
		<h2 id="letter-{group.letter}" class="section-head">{group.letter}</h2>
		<dl>
			{#each group.items as item (item.key)}
				<!--
					dt and dd are direct children of dl on purpose. Wrapping each pair in a div is
					valid HTML and convenient for layout, but it costs the term/definition roles in
					at least one browser's accessibility tree — so the grid goes on the dl instead.
				-->
				<dt data-abbr={item.abbr} class:ambiguous={item.ambiguous}>
					{item.abbr}
					{#if item.ambiguous}
						<span class="flag">two meanings</span>
					{/if}
				</dt>
				<dd data-abbr={item.abbr}>
					{#if item.ambiguous}
						<p class="warn">
							These letters are used for two different things. Which one is meant depends on
							what is being talked about.
						</p>
					{/if}
					<ul>
						{#each item.senses as sense (sense.id)}
							<li>
								<a href={resolve('/glossary/[slug]', { slug: sense.id })}>{sense.term}</a>
								{#if item.hasExpansion && !sense.expands}
									<span class="related">related</span>
								{/if}
								<span class="cat">{CATEGORY_LABELS[sense.category] ?? sense.category}</span>
								<p class="gloss">{sense.gloss}.</p>
							</li>
						{/each}
					</ul>
				</dd>
			{/each}
		</dl>
	</section>
{/each}

<p class="scope">
	<strong>What this list is.</strong> These are the abbreviations that appear in this app's
	glossary, not every abbreviation in the field — if something is missing, it is because the
	glossary does not cover it yet. An entry marked <span class="related">related</span> means the
	letters do not stand for that term, but they will lead you to it: MSWO is a kind of preference
	assessment, not another name for one.
</p>

<style>
	h1 {
		font-size: 1.5rem;
	}

	.lede {
		color: var(--text-muted);
		margin-top: 0;
	}

	.field {
		display: block;
		margin: 1rem 0 0.5rem;
	}

	.field span {
		display: block;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.field input {
		width: 100%;
		min-height: var(--tap);
		padding: 0.5rem 0.7rem;
		font-size: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
	}

	.count {
		color: var(--text-muted);
		font-size: 0.9rem;
		margin: 0 0 1rem;
	}

	dl {
		display: grid;
		grid-template-columns: minmax(4.5rem, auto) 1fr;
		gap: 0.25rem 0.75rem;
		margin: 0;
	}

	/* One column at phone width: a long expansion beside a 5-character key wraps to shreds. */
	@media (max-width: 30rem) {
		dl {
			grid-template-columns: 1fr;
			gap: 0.15rem 0;
		}

		dd {
			padding-bottom: 0.6rem;
		}
	}

	dt {
		grid-column: 1;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		padding-top: 0.6rem;
	}

	dd {
		grid-column: -2;
		margin: 0;
		padding-top: 0.6rem;
		border-bottom: 1px solid var(--border);
	}

	@media (max-width: 30rem) {
		dt {
			grid-column: 1;
		}

		dd {
			grid-column: 1;
			padding-top: 0;
		}
	}

	dd ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	dd li + li {
		margin-top: 0.5rem;
	}

	.gloss {
		margin: 0.15rem 0 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	/* Never colour alone — every flag is a word as well. */
	.flag,
	.related,
	.cat {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.1rem 0.4rem;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		color: var(--text-muted);
	}

	.flag {
		border-color: var(--caution-border, var(--border));
		color: var(--text);
	}

	.warn {
		margin: 0 0 0.35rem;
		font-size: 0.85rem;
	}

	.empty,
	.scope {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.scope {
		margin-top: 1.5rem;
	}
</style>
