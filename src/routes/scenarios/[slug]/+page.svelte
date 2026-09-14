<script lang="ts">
	import { resolve } from '$app/paths';
	import { CONTACT_LABELS, RISK_LABELS, IMMEDIATE_CONTACTS } from '$lib/content/scenarios.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const s = $derived(data.scenario);
</script>

<svelte:head>
	<title>{s.title} — ABA Help</title>
	<meta name="description" content={s.situation.slice(0, 155)} />
</svelte:head>

<nav aria-label="Breadcrumb" class="crumbs">
	<a href={resolve('/scenarios')}>Situations</a>
</nav>

<article>
	<h1>{s.title}</h1>

	{#if s.kind === 'escalation-only'}
		<div class="stop" role="note">
			<p><strong>Stop and escalate.</strong> This app does not give a procedure here.</p>
		</div>

		<ul class="flags">
			{#each s.riskFlags as f (f)}<li>{RISK_LABELS[f] ?? f}</li>{/each}
		</ul>
	{/if}

	<h2>The situation</h2>
	<p>{s.situation}</p>

	{#if s.kind === 'guidance'}
		<h2>What the plan usually asks for</h2>
		<ol>
			{#each s.steps as step, i (i)}
				<li>
					{step.text}
					{#if step.rationale}<span class="why">{step.rationale}</span>{/if}
				</li>
			{/each}
		</ol>

		<h2>What not to do</h2>
		<ul>
			{#each s.whatNotToDo as x, i (i)}<li>{x}</li>{/each}
		</ul>

		<h2>When to tell your supervisor</h2>
		<ul>
			{#each s.whenToEscalate as x, i (i)}<li>{x}</li>{/each}
		</ul>
	{:else}
		<h2>Contact now</h2>
		<ul class="contacts">
			{#each s.escalation.contacts as c (c)}
				<li class:immediate={IMMEDIATE_CONTACTS.has(c)}>
					{#if IMMEDIATE_CONTACTS.has(c)}<span class="visually-hidden">Immediate: </span>{/if}
					{CONTACT_LABELS[c] ?? c}
				</li>
			{/each}
		</ul>

		<h2>Right now</h2>
		<p>{s.escalation.immediateSafetyNote}</p>

		{#if s.escalation.mandatedReporterNote}
			<h2>Mandated reporting</h2>
			<p>{s.escalation.mandatedReporterNote}</p>
		{/if}

		<h2>Write down</h2>
		<ul>
			{#each s.escalation.documentation as d, i (i)}<li>{d}</li>{/each}
		</ul>

		<p class="legal">{s.escalation.legalNote}</p>
	{/if}

	{#if data.terms.length > 0}
		<h2>Terms used here</h2>
		<ul class="links">
			{#each data.terms as t (t.id)}
				<li><a href={resolve('/glossary/[slug]', { slug: t.id })}>{t.name}</a></li>
			{/each}
		</ul>
	{/if}

	<section class="sources">
		<h2>Written from</h2>
		<ul>
			{#each s.citations as c, i (i)}
				<li>{c.sourceId}{c.locator ? ` — ${c.locator}` : ''}</li>
			{/each}
		</ul>
		{#if s.review.status !== 'approved'}
			<p class="unreviewed">This entry has not yet been through clinical review.</p>
		{/if}
	</section>
</article>

<style>
	.crumbs {
		font-size: 0.9rem;
	}
	h1 {
		font-size: 1.5rem;
	}
	h2 {
		font-size: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin-top: 1.75rem;
	}
	.stop {
		background: var(--stop-bg);
		border: 2px solid var(--stop-border);
		color: var(--stop-text);
		border-radius: var(--radius);
		padding: 0.5rem 1rem;
	}
	.flags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		list-style: none;
		padding: 0;
	}
	.flags li {
		font-size: 0.8rem;
		padding: 0.15rem 0.6rem;
		border: 1px solid var(--caution-border);
		background: var(--caution-bg);
		color: var(--caution-text);
		border-radius: 999px;
	}
	.why {
		display: block;
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	ol li,
	ul li {
		margin-bottom: 0.6rem;
	}
	.contacts {
		list-style: none;
		padding: 0;
	}
	.contacts li {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.contacts li.immediate {
		background: var(--stop-bg);
		border-color: var(--stop-border);
		color: var(--stop-text);
		font-weight: 700;
	}
	.links {
		list-style: none;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.links a {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		text-decoration: none;
	}
	.legal,
	.sources {
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.sources {
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
	.unreviewed {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius);
	}
</style>
