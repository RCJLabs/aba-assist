<script lang="ts">
	import { resolve } from '$app/paths';
	import PageBand from '$lib/components/PageBand.svelte';
	import { settings } from '$lib/state/settings.svelte.js';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { errataUrl } from '$lib/config.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const topic = $derived(data.topic);

	function togglePlain() {
		settings.set('plainLanguage', !settings.plainLanguage);
		announcer.announce(
			settings.plainLanguage ? 'Showing plain language' : 'Showing the full explanation'
		);
	}
</script>

<svelte:head>
	<title>{topic.ourLabel} — Ethics — ABA Assist</title>
	<meta name="description" content={topic.gloss} />
</svelte:head>

<PageBand label="Ethics" detail={topic.gloss} />

<nav aria-label="Breadcrumb" class="crumbs">
	<a href={resolve('/ethics')}>Ethics</a>
</nav>

<article>
	<header>
		<h1>{topic.ourLabel}</h1>
		<p class="gloss">{topic.gloss}</p>
		<ul class="who">
			{#each topic.appliesTo as c (c)}
				<li>{c}</li>
			{/each}
		</ul>
	</header>

	<div class="switcher">
		<button type="button" onclick={togglePlain} aria-pressed={settings.plainLanguage}>
			{settings.plainLanguage ? 'Show the full explanation' : 'Show plain language'}
		</button>
	</div>

	<!--
		Both versions stay in the DOM and are toggled with `hidden`, so the prerendered page
		is complete for a search engine and for a reader with no JavaScript, who gets the
		full explanation by default.
	-->
	<section class="summary" hidden={settings.plainLanguage}>
		<h2 class="visually-hidden">What the obligation is</h2>
		<p>{topic.ourSummary}</p>
	</section>
	<section class="summary plain" hidden={!settings.plainLanguage}>
		<h2 class="visually-hidden">In plain language</h2>
		<p>{topic.plainSummary}</p>
	</section>

	<section>
		<h2 class="section-head">What this looks like</h2>
		<ul class="looks">
			{#each topic.whatThisLooksLike as item, i (i)}
				<li>{item}</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2 class="section-head">Where people get caught</h2>
		<ul class="pitfalls">
			{#each topic.commonPitfalls as item, i (i)}
				<li>{item}</li>
			{/each}
		</ul>
	</section>

	<section class="unsure">
		<h2 class="section-head">If you are not sure</h2>
		<p>{topic.ifYouAreUnsure}</p>
	</section>

	<section>
		<h2 class="section-head">In the codes</h2>
		<ul class="codes">
			{#each data.codes as c, i (i)}
				<li>
					<strong>{c.shortName}</strong>
					<span>Section {c.section} — {c.sectionLabel}</span>
					{#if c.standards.length > 0}
						<ul class="stds">
							{#each c.standards as s (s.number)}
								<li><span class="num">{s.number}</span> {s.ourLabel}</li>
							{/each}
						</ul>
					{:else}
						<span class="std">
							Standard numbers not listed — this app has not verified them against the code.
						</span>
					{/if}
					{#if c.officialUrl}
						<!-- The code itself is an external document, not an app route. -->
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href={c.officialUrl} rel="noopener">Read the official code</a>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	{#if topic.taskRefs.length > 0}
		<section>
			<h2 class="section-head">On the exam</h2>
			<ul class="links">
				{#each topic.taskRefs as t, i (i)}
					<li>
						<a href={resolve('/exams')}>{t.credential} {t.code}</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.terms.length > 0}
		<section>
			<h2 class="section-head">Terms used here</h2>
			<ul class="links">
				{#each data.terms as t (t.id)}
					<li><a href={resolve('/glossary/[slug]', { slug: t.id })}>{t.name}</a></li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.scenarios.length > 0}
		<section>
			<h2 class="section-head">Situations where this comes up</h2>
			<ul class="situations">
				{#each data.scenarios as s (s.id)}
					<li><a href={resolve('/scenarios/[slug]', { slug: s.id })}>{s.title}</a></li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.related.length > 0}
		<section>
			<h2 class="section-head">Related topics</h2>
			<ul class="links">
				{#each data.related as r (r.id)}
					<li><a href={resolve('/ethics/[slug]', { slug: r.id })}>{r.label}</a></li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="sources">
		<h2 class="section-head">Written from</h2>
		<ul>
			{#each topic.citations as c, i (i)}
				<li>{c.sourceId}{c.locator ? ` — ${c.locator}` : ''}</li>
			{/each}
		</ul>
		<p class="attest">{topic.attestation.consulted}</p>
		{#if topic.review.status !== 'approved'}
			<p class="unreviewed">
				This entry has not yet been through independent review. Treat it as a draft, and read
				the official code for anything that matters.
			</p>
		{/if}
		<p>
			<!-- External GitHub URL, not an app route. -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={errataUrl(topic.ourLabel)} rel="noopener">Something wrong here? Report it.</a>
		</p>
	</section>
</article>

<style>
	.stds {
		list-style: none;
		margin: 0.4rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	.stds li {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		font-size: 0.95rem;
	}
	.stds .num {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		color: var(--text-muted);
		flex: 0 0 auto;
	}

	.crumbs {
		font-size: 0.9rem;
	}
	h1 {
		font-size: 1.5rem;
		margin-bottom: 0.15rem;
	}
	.gloss {
		color: var(--text-muted);
		margin-top: 0;
	}
	.who {
		display: flex;
		gap: 0.4rem;
		list-style: none;
		padding: 0;
		margin: 0.25rem 0 0;
	}
	.who li {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.03em;
		padding: 0.15rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text-muted);
	}
	.switcher {
		margin: 1rem 0;
	}
	.summary p {
		font-size: 1.05rem;
	}
	.summary.plain p {
		background: var(--surface);
		border-left: 4px solid var(--accent);
		padding: 0.75rem 1rem;
		border-radius: 0 var(--radius) var(--radius) 0;
	}
	.looks li,
	.pitfalls li {
		margin-bottom: 0.5rem;
	}
	/* Pitfalls carry a caution rule as well as their heading; never colour alone. */
	.pitfalls {
		padding-left: 1.2rem;
	}
	.pitfalls li {
		border-left: 3px solid var(--caution-border);
		padding-left: 0.6rem;
		list-style: none;
		margin-left: -1.2rem;
	}
	.unsure p {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
	}
	.codes {
		list-style: none;
		padding: 0;
	}
	.codes li {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.6rem 0.8rem;
		margin-bottom: 0.5rem;
	}
	.codes strong,
	.codes span {
		display: block;
	}
	.std {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.codes a {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		font-size: 0.9rem;
	}
	.links,
	.situations {
		list-style: none;
		padding: 0;
	}
	.links {
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
	.situations li {
		border-bottom: 1px solid var(--border);
	}
	.situations a {
		display: block;
		min-height: var(--tap);
		padding: 0.6rem 0.25rem;
	}
	.sources {
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.sources ul {
		padding-left: 1.2rem;
	}
	.attest {
		font-style: italic;
	}
	.unreviewed {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius);
	}
</style>
