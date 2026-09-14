<script lang="ts">
	import { resolve } from '$app/paths';
	import { termsByCategory, CATEGORY_LABELS, termIndex } from '$lib/content/load.js';

	const grouped = termsByCategory();
	const categories = [...grouped.keys()].sort((a, b) =>
		(CATEGORY_LABELS[a] ?? a).localeCompare(CATEGORY_LABELS[b] ?? b)
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

{#each categories as c (c)}
	<section id={c}>
		<h2>{CATEGORY_LABELS[c] ?? c}</h2>
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
	h1 {
		font-size: 1.5rem;
	}

	h2 {
		font-size: 1.1rem;
		margin-top: 2rem;
		padding-bottom: 0.25rem;
		border-bottom: 2px solid var(--border);
	}

	ul {
		list-style: none;
		padding: 0;
	}

	li {
		border-bottom: 1px solid var(--border);
	}

	a {
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
