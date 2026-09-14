<script lang="ts">
	import { resolve } from '$app/paths';
	import { termIndex, CATEGORY_LABELS, contentVersion } from '$lib/content/load.js';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { search } from '$lib/state/search.svelte.js';

	const results = $derived(search.results);

	let lastAnnounced = -1;
	$effect(() => {
		const n = results.length;
		const q = search.query.trim();
		if (q.length < 2) {
			lastAnnounced = -1;
			return;
		}
		if (n === lastAnnounced) return;
		lastAnnounced = n;
		// Debounced by the reader's own typing rather than a timer: announcing on every
		// keystroke would make a screen reader unusable, so this only speaks when the
		// count actually changes.
		announcer.announce(`${n} ${n === 1 ? 'result' : 'results'} for ${q}`);
	});
</script>

<svelte:head>
	<title>ABA Assist — offline reference for behavior technicians</title>
	<meta
		name="description"
		content="A free, offline reference for behavior technicians, analysts, and paraeducators. Plain-language definitions with sources."
	/>
</svelte:head>

<h1>Look something up</h1>

<!--
	`data-search-status` reflects which tier is answering: `idle`/`loading` means the
	instant substring fallback, `ready` means the fuzzy index has taken over. It is not
	shown to readers — swapping results silently is the point — but it makes the handover
	observable, so tests can wait for it deterministically instead of racing a timeout.
-->
<form role="search" data-search-status={search.status} onsubmit={(e) => e.preventDefault()}>
	<label for="q">Search terms</label>
	<input
		id="q"
		type="search"
		bind:value={search.query}
		placeholder="reinforcement, MO, partial interval…"
		autocomplete="off"
		enterkeyhint="search"
		onfocus={() => search.warm()}
		oninput={() => search.warm()}
	/>
</form>

{#if search.query.trim().length >= 2}
	<p class="count">{results.length} {results.length === 1 ? 'result' : 'results'}</p>
	{#if results.length > 0}
		<ul class="results">
			{#each results as r (r.id)}
				<li>
					<a href={resolve('/glossary/[slug]', { slug: r.id })}>
						<span class="term">{r.term}</span>
						<span class="gloss">{r.gloss}</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p>
			Nothing matched. The glossary is still small — this build has {termIndex.length} terms.
			<a href="{resolve('/about')}#errata">Tell us what is missing.</a>
		</p>
	{/if}
{:else}
	<nav aria-label="Browse" class="tiles">
		<a class="tile stop" href={resolve('/help')}>
			<strong>Something urgent is happening</strong>
			<span>Who to contact, and what to write down.</span>
		</a>
		<a class="tile" href={resolve('/glossary')}>
			<strong>Glossary</strong>
			<span>{termIndex.length} terms, plain language and technical.</span>
		</a>
		<a class="tile" href={resolve('/scenarios')}>
			<strong>Situations</strong>
			<span>What the literature says, and when to ask your supervisor.</span>
		</a>
	</nav>

	<h2>Browse by area</h2>
	<ul class="cats">
		{#each [...new Set(termIndex.map((t) => t.c))].sort() as c (c)}
			<li><a href="{resolve('/glossary')}#{c}">{CATEGORY_LABELS[c] ?? c}</a></li>
		{/each}
	</ul>
{/if}

<p class="version">
	Content version {contentVersion.contentVersion} · aligned to the RBT Test Content Outline (3rd
	ed.), effective 1 January 2026
</p>

<style>
	h1 {
		font-size: 1.5rem;
	}

	label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	input[type='search'] {
		width: 100%;
		padding: 0.75rem;
		font-size: 1.1rem;
		border: 2px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		color: var(--text);
	}

	.count {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.results,
	.cats,
	.tiles {
		list-style: none;
		padding: 0;
	}

	.results li {
		border-bottom: 1px solid var(--border);
	}

	.results a {
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

	.tiles {
		display: grid;
		gap: 0.75rem;
		margin: 1.5rem 0;
	}

	.tile {
		display: block;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		text-decoration: none;
		color: var(--text);
	}

	.tile strong {
		display: block;
		color: var(--link);
	}

	.tile span {
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.tile.stop {
		background: var(--stop-bg);
		border-color: var(--stop-border);
	}

	.tile.stop strong,
	.tile.stop span {
		color: var(--stop-text);
	}

	/*
	 * The list items are flex containers, not blocks holding an inline-flex anchor.
	 * With inline-level anchors the 44px chips overflow their line boxes and overlap the
	 * neighbouring row, which axe correctly reports as a partially obscured target
	 * (WCAG 2.2 2.5.8) even though the chips themselves are large enough.
	 *
	 * The gap is >= 24px so the target-offset check passes too: adjacent targets need a
	 * 24px clickable diameter between their centres.
	 */
	.cats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
	}

	.cats li {
		display: flex;
	}

	.cats a {
		display: flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		text-decoration: none;
	}

	.version {
		margin-top: 2rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
</style>
