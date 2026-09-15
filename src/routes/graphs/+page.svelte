<script lang="ts">
	import { resolve } from '$app/paths';
	import Graph from '$lib/components/Graph.svelte';
	import { graphById } from '$lib/content/load.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const DESIGN_LABEL: Record<string, string> = {
		'single-phase': 'One condition',
		ab: 'Baseline and change',
		abab: 'Reversal',
		'multiple-baseline': 'Multiple baseline',
		'changing-criterion': 'Changing criterion',
		'alternating-treatments': 'Alternating treatments'
	};
</script>

<svelte:head>
	<title>Reading graphs — ABA Assist</title>
	<meta
		name="description"
		content="Line graphs of behaviour explained one at a time: the parts of a graph, level, trend, variability, a reversal design and a multiple baseline. Every graph has a data table and a written description."
	/>
</svelte:head>

<h1>Reading graphs</h1>
<p class="lede">
	Data collection and graphing is the second-largest part of the technician exam, and it is the
	one part that cannot be learned from a definition — a graph has to be looked at. Each of
	these shows one thing, says what a reader should see in it, and carries the numbers in a
	table underneath.
</p>
<p class="note">
	Every graph here is invented. Real behaviour data belong to the person they were collected
	from, and none of it is in this app.
</p>

<ul class="list">
	{#each data.graphs as g (g.id)}
		{@const full = graphById(g.id)}
		<li>
			<article>
				<h2><a href={resolve('/graphs/[slug]', { slug: g.id })}>{g.title}</a></h2>
				<p class="design">{DESIGN_LABEL[g.design] ?? g.design}</p>
				<p>{g.gloss}.</p>
				{#if full}
					<Graph graph={full} showTable={false} />
				{/if}
			</article>
		</li>
	{/each}
</ul>

<style>
	h1 {
		font-size: 1.5rem;
	}
	.lede {
		color: var(--text-muted);
	}
	.note {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.6rem 0.75rem;
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.list {
		list-style: none;
		margin: 1.5rem 0 0;
		padding: 0;
		display: grid;
		gap: 1.5rem;
	}
	h2 {
		font-size: 1.15rem;
		margin: 0 0 0.15rem;
	}
	.design {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
</style>
