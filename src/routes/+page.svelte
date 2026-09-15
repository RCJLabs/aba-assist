<script lang="ts">
	import { resolve } from '$app/paths';
	import ContentFilters from '$lib/components/ContentFilters.svelte';
	import { termIndex, CATEGORY_LABELS, contentVersion, outlines } from '$lib/content/load.js';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { filters } from '$lib/state/filters.svelte.js';
	import { search, type SearchHit } from '$lib/state/search.svelte.js';

	// Search results respect the same exam/domain/category filter as the glossary, so
	// someone studying for one exam never sees content that is not on it.
	const results = $derived(search.results.filter((r) => filters.matchesHit(r)));

	/**
	 * Where a hit goes.
	 *
	 * Route ids resolved here rather than paths stored in the index: the base path differs
	 * between an origin root and a project site, and a href built by hand is exactly what
	 * breaks when it changes. A practice guide and an exam task are sections of a page
	 * rather than pages, so they get a fragment.
	 */
	function hrefFor(r: SearchHit): string {
		switch (r.kind) {
			case 'scenario':
				return resolve('/scenarios/[slug]', { slug: r.id });
			case 'ethics-topic':
				return resolve('/ethics/[slug]', { slug: r.id });
			case 'practice-guide':
				return resolve('/tools/notes');
			case 'graph':
				return resolve('/graphs/[slug]', { slug: r.id });
			case 'task':
				return r.parent ? resolve('/exams/[id]', { id: r.parent }) : resolve('/exams');
			default:
				return resolve('/glossary/[slug]', { slug: r.id });
		}
	}

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

	const outlineList = Object.values(outlines);
	/*
	 * Counts from the compiled manifest rather than from the corpora.
	 *
	 * Importing `scenarios` and `graphList` to render two numbers pulled every situation,
	 * every graph and everything they transitively reach into the bundle the home page
	 * loads — half a megabyte of script to say "36". The build already counts these.
	 */
	const counts = contentVersion.counts;
	const questionCount = counts.questions ?? 0;
	const scenarioCount = counts.scenarios ?? 0;
	const graphCount = counts.graphs ?? 0;
</script>

<svelte:head>
	<title
		>ABA Assist — offline reference and study tool for behavior technicians and analysts</title
	>
	<meta
		name="description"
		content="A free, offline reference and study tool for behavior technicians, analysts, and paraeducators. Plain-language definitions with sources, flashcards, practice questions, and situational guidance."
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

<details class="filter-box" open={filters.active}>
	<summary>
		Filter{#if filters.active}: {filters.describe() || 'category'}{:else}: everything{/if}
	</summary>
	<ContentFilters label="Filter search results" />
</details>

{#if search.query.trim().length >= 2}
	<p class="count">{results.length} {results.length === 1 ? 'result' : 'results'}</p>
	{#if results.length > 0}
		<ul class="results">
			{#each results as r (r.kind + ':' + r.id)}
				<li>
					<!-- Resolved above; the linter cannot see through the helper. -->
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={hrefFor(r)}>
						<span class="term">
							{r.title}
							<span class="kind" data-kind={r.kind}>{r.label}</span>
						</span>
						<span class="gloss">{r.gloss}</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p>
			Nothing matched{#if filters.active}
				with the current filter{/if}. This build has {termIndex.length} terms, {scenarioCount}
			situations and the ethics reference.
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
		<a class="tile" href={resolve('/study')}>
			<strong>Flashcards</strong>
			<span>Spaced repetition over any set of terms. Works offline.</span>
		</a>
		<a class="tile" href={resolve('/plan')}>
			<strong>What to study next</strong>
			<span>Your practice history, read as a plan rather than a score.</span>
		</a>
		<a class="tile" href={resolve('/quiz')}>
			<strong>Practice questions</strong>
			<span>{questionCount} original questions with a rationale for every option.</span>
		</a>
		<a class="tile" href={resolve('/tools')}>
			<strong>Supervision and PDUs</strong>
			<span>Log contacts and units against the real requirements. No client data, ever.</span>
		</a>
		<a class="tile" href={resolve('/ethics')}>
			<strong>Ethics</strong>
			<span>Both codes in plain language: what each obligation means in practice.</span>
		</a>
		<a class="tile" href={resolve('/exams')}>
			<strong>Exam outlines</strong>
			<span
				>{outlineList.map((o) => o.credential).join(' and ')}: domains, weights, tasks,
				requirements.</span
			>
		</a>
		<a class="tile" href={resolve('/graphs')}>
			<strong>Reading graphs</strong>
			<span
				>{graphCount} worked graphs: level, trend, variability and what a design shows.</span
			>
		</a>
		<a class="tile" href={resolve('/scenarios')}>
			<strong>Situations</strong>
			<span
				>{scenarioCount} situations: what the literature says, and when to ask your supervisor.</span
			>
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
	ed., effective 1 January 2026) and the BCBA Test Content Outline (6th ed., effective 1 January
	2025)
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

	.filter-box {
		margin: 0.5rem 0 1rem;
		font-size: 0.95rem;
	}

	.filter-box summary {
		display: flex;
		align-items: center;
		min-height: var(--tap);
		cursor: pointer;
		color: var(--link);
	}

	.count {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.kind {
		display: inline-block;
		margin-left: 0.5rem;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		vertical-align: middle;
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.05rem 0.45rem;
		color: var(--text-muted);
	}
	/* Never colour alone: the badge is a word first. */
	.kind[data-kind='scenario'],
	.kind[data-kind='ethics-topic'] {
		border-color: var(--accent);
		color: var(--accent);
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

	@media (min-width: 36rem) {
		.tiles {
			grid-template-columns: 1fr 1fr;
		}
		.tile.stop {
			grid-column: 1 / -1;
		}
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
