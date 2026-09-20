<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { resolve } from '$app/paths';
	import PageBand from '$lib/components/PageBand.svelte';
	import Graph from '$lib/components/Graph.svelte';
	import { lookups } from '$lib/state/lookups.svelte.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/*
	 * Recorded so the reader can see their own pattern later. An effect rather than
	 * `onMount`, because moving between two graphs reuses this component — the slug changes
	 * and nothing remounts, so a mount hook would record the first one of a session and
	 * nothing after it.
	 */
	$effect(() => {
		lookups.note('graph', data.graph.id, data.graph.title);
	});

	const FEATURE_LABEL: Record<string, string> = {
		level: 'Level',
		trend: 'Trend',
		variability: 'Variability',
		immediacy: 'How quickly it changed',
		overlap: 'Overlap',
		'phase-change': 'At the phase change',
		design: 'What the design can and cannot show'
	};

	const phaseLabel = (id: string | null) =>
		id ? (data.graph.phases.find((p) => p.id === id)?.label ?? null) : null;
</script>

<Seo title={data.graph.title} description={data.graph.gloss} />

<PageBand label="Graph" />

<nav aria-label="Breadcrumb" class="crumbs"><a href={resolve('/graphs')}>Graphs</a></nav>

<h1>{data.graph.title}</h1>
<p class="lede">{data.graph.gloss}.</p>

<Graph graph={data.graph} showCallouts={data.callouts.length > 0} />

{#if data.callouts.length > 0}
	<section>
		<h2 class="section-head">The parts, one at a time</h2>
		<dl class="parts">
			{#each data.callouts as c (c.id)}
				<dt>{c.label}</dt>
				<dd>
					{c.text}
					{#if c.termRef && c.termName}
						<a href={resolve('/glossary/[slug]', { slug: c.termRef })}>{c.termName}</a>
					{/if}
				</dd>
			{/each}
		</dl>
	</section>
{/if}

{#if data.graph.readings.length > 0}
	<section>
		<h2 class="section-head">What to see in it</h2>
		<dl class="parts">
			{#each data.graph.readings as r (r.id)}
				<dt>
					{FEATURE_LABEL[r.feature] ?? r.feature}
					{#if phaseLabel(r.phaseId)}<span class="phase">{phaseLabel(r.phaseId)}</span>{/if}
				</dt>
				<dd>{r.text}</dd>
			{/each}
		</dl>
	</section>
{/if}

<section>
	<h2 class="section-head">Why it matters</h2>
	<p>{data.graph.teaching}</p>
</section>

<section class="plain">
	<h2 class="section-head">In plain language</h2>
	<p>{data.graph.plainSummary}</p>
</section>

<section>
	<h2 class="section-head">What changed, and when</h2>
	<ol class="phases">
		{#each data.graph.phases as p (p.id)}
			<li>
				<strong>{p.label}</strong>
				<span class="range">
					{data.graph.x.label.toLowerCase()}
					{p.from}–{p.to}{#if p.seriesId}, {data.graph.series.find((s) => s.id === p.seriesId)
							?.label ?? p.seriesId}{/if}
				</span>
				{#if p.changeNote}<span class="detail">{p.changeNote}</span>{/if}
			</li>
		{/each}
	</ol>
</section>

{#if data.terms.length > 0}
	<section>
		<h2 class="section-head">Terms on this page</h2>
		<ul class="terms">
			{#each data.terms as t (t.id)}
				<li><a href={resolve('/glossary/[slug]', { slug: t.id })}>{t.name}</a></li>
			{/each}
		</ul>
	</section>
{/if}

<nav class="pager" aria-label="Graphs">
	{#if data.prev}
		<a href={resolve('/graphs/[slug]', { slug: data.prev.id })} rel="prev">
			<span>Previous</span>{data.prev.title}
		</a>
	{/if}
	{#if data.next}
		<a href={resolve('/graphs/[slug]', { slug: data.next.id })} rel="next" class="next">
			<span>Next</span>{data.next.title}
		</a>
	{/if}
</nav>

<style>
	h1 {
		font-size: 1.5rem;
	}
	.crumbs {
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
	}
	.lede {
		color: var(--text-muted);
	}
	section {
		margin: 1.5rem 0;
	}
	.parts {
		margin: 0;
	}
	.parts dt {
		font-weight: 700;
		margin-top: 0.75rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
	}
	.phase {
		font-weight: 400;
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.parts dd {
		margin: 0.15rem 0 0;
	}
	.plain {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.25rem 1rem 0.75rem;
	}
	.phases {
		padding-left: 1.2rem;
		display: grid;
		gap: 0.5rem;
	}
	.range,
	.detail {
		display: block;
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.terms {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.terms a {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0 0.7rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		text-decoration: none;
	}
	.pager {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		justify-content: space-between;
		border-top: 1px solid var(--border);
		padding-top: 0.75rem;
		margin-top: 2rem;
	}
	.pager a {
		display: flex;
		flex-direction: column;
		min-height: var(--tap);
		justify-content: center;
	}
	.pager .next {
		text-align: right;
		margin-left: auto;
	}
	.pager span {
		font-size: 0.8rem;
		color: var(--text-muted);
	}
</style>
