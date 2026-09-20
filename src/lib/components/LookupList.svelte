<script lang="ts">
	/**
	 * A list of things somebody has opened, as links back to them.
	 *
	 * The href is rebuilt from `kind` and `slug` rather than stored, so a row survives the
	 * base path changing — which it will, the first time the app is served from a custom
	 * domain rather than a project subdirectory. A stored URL would have gone stale for
	 * every reader at once.
	 */
	import { resolve } from '$app/paths';
	import type { Lookup, LookupKind } from '$lib/study/lookups.js';

	let { rows, showCount = false }: { rows: readonly Lookup[]; showCount?: boolean } = $props();

	const KIND_LABEL: Record<LookupKind, string> = {
		term: 'Term',
		scenario: 'Situation',
		ethics: 'Ethics',
		graph: 'Graph'
	};

	function href(row: Lookup): string {
		switch (row.kind) {
			case 'term':
				return resolve('/glossary/[slug]', { slug: row.slug });
			case 'scenario':
				return resolve('/scenarios/[slug]', { slug: row.slug });
			case 'ethics':
				return resolve('/ethics/[slug]', { slug: row.slug });
			case 'graph':
				return resolve('/graphs/[slug]', { slug: row.slug });
		}
	}
</script>

<ul class="lookups" data-lookup-list>
	{#each rows as row (row.id)}
		<li>
			<!--
				The rule wants to see `resolve()` at the attribute. It is one call away, in
				`href()` above, which is where it has to be: the route template differs per
				kind and inlining four of them here would put the same switch in the markup.
			-->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={href(row)}>
				<span class="title">{row.title}</span>
				<span class="kind">{KIND_LABEL[row.kind]}</span>
			</a>
			{#if showCount}
				<!--
					The number is stated rather than drawn as a bar or a dot row. A length is
					read as a score, and this is a count of visits, not a measure of how badly
					somebody knows something — the wording around the list says so and the
					shape should not quietly contradict it.
				-->
				<span class="count">Opened {row.count} times</span>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.lookups {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	a {
		/* 44px of target, per the one-handed floor the rest of the app holds to. */
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
		min-height: 44px;
		align-content: center;
		padding: 0.35rem 0;
		flex: 1 1 12rem;
	}

	.title {
		font-weight: 600;
	}

	.kind {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.count {
		font-size: 0.85rem;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
</style>
