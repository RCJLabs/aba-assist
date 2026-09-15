<script lang="ts">
	import { resolve } from '$app/paths';
	import { settings } from '$lib/state/settings.svelte.js';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { CATEGORY_LABELS } from '$lib/content/load.js';
	import { errataUrl } from '$lib/config.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const term = $derived(data.term);

	function togglePlain() {
		settings.set('plainLanguage', !settings.plainLanguage);
		announcer.announce(
			settings.plainLanguage ? 'Showing plain language' : 'Showing technical definition'
		);
	}
</script>

<svelte:head>
	<title>{term.term} — ABA Assist</title>
	<meta name="description" content={term.definition.gloss} />
</svelte:head>

<nav aria-label="Breadcrumb" class="crumbs">
	<a href={resolve('/glossary')}>Glossary</a>
	<span aria-hidden="true">›</span>
	<span>{CATEGORY_LABELS[term.category] ?? term.category}</span>
</nav>

<article>
	<header>
		<h1>{term.term}</h1>
		{#if term.aliases.length > 0}
			<p class="aliases">Also called: {term.aliases.join(', ')}</p>
		{/if}
	</header>

	<div class="switcher">
		<button type="button" onclick={togglePlain} aria-pressed={settings.plainLanguage}>
			{settings.plainLanguage ? 'Show technical wording' : 'Show plain language'}
		</button>
	</div>

	<!--
		Both definitions are always in the DOM and toggled with `hidden`, not swapped by
		re-rendering. That keeps the prerendered HTML complete for search engines and for a
		reader with no JavaScript, who gets the technical definition by default.
	-->
	<section class="definition" hidden={settings.plainLanguage}>
		<h2 class="visually-hidden">Definition</h2>
		<p>{term.definition.technical}</p>
	</section>

	<section class="definition plain" hidden={!settings.plainLanguage}>
		<h2 class="visually-hidden">In plain language</h2>
		<p>{term.definition.plain}</p>
	</section>

	<section>
		<h2>Example{term.examples.length > 1 ? 's' : ''}</h2>
		<ul class="examples">
			{#each term.examples as ex, i (i)}
				<li>
					<p>{ex.text}</p>
					{#if ex.why}<p class="why">{ex.why}</p>{/if}
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>Not {term.term.toLowerCase()}</h2>
		<ul class="examples non">
			{#each term.nonExamples as ex, i (i)}
				<li>
					<p>{ex.text}</p>
					{#if ex.why}<p class="why">{ex.why}</p>{/if}
				</li>
			{/each}
		</ul>
	</section>

	{#if data.contrastWith.length > 0}
		<section>
			<h2>Commonly confused with</h2>
			<ul class="links">
				{#each data.contrastWith as t (t.id)}
					<li><a href={resolve('/glossary/[slug]', { slug: t.id })}>{t.name}</a></li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.graphs.length > 0}
		<section>
			<h2>Shown on a graph</h2>
			<ul class="links">
				{#each data.graphs as g (g.id)}
					<li><a href={resolve('/graphs/[slug]', { slug: g.id })}>{g.title}</a></li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.seeAlso.length > 0}
		<section>
			<h2>See also</h2>
			<ul class="links">
				{#each data.seeAlso as t (t.id)}
					<li><a href={resolve('/glossary/[slug]', { slug: t.id })}>{t.name}</a></li>
				{/each}
			</ul>
		</section>
	{/if}

	<!--
		Sources are shown, not hidden behind a disclosure. Being able to check the basis of
		a statement is what separates a reference from a flashcard app, and it is the
		posture that keeps a tool like this clearly outside clinical-decision territory.
	-->
	<section class="sources">
		<h2>Written from</h2>
		<ul>
			{#each term.citations as c, i (i)}
				<li>{c.sourceId}{c.locator ? ` — ${c.locator}` : ''}</li>
			{/each}
		</ul>
		<p class="attest">{term.attestation.consulted}</p>
		{#if term.review.status !== 'approved'}
			<p class="unreviewed">
				This entry has not yet been through clinical review. Treat it as a draft.
			</p>
		{/if}
	</section>

	<p class="errata">
		<!-- An external GitHub URL, not an app route: resolve() does not apply. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href={errataUrl(term.term)} rel="noopener"> Something wrong here? Report it. </a>
	</p>
</article>

<style>
	.crumbs {
		font-size: 0.9rem;
		color: var(--text-muted);
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

	h1 {
		font-size: 1.6rem;
		margin-bottom: 0.25rem;
	}

	.aliases {
		color: var(--text-muted);
		font-size: 0.9rem;
		margin-top: 0;
	}

	.switcher {
		margin: 1rem 0;
	}

	.definition p {
		font-size: 1.05rem;
	}

	.definition.plain p {
		background: var(--surface);
		border-left: 4px solid var(--accent);
		padding: 0.75rem 1rem;
		border-radius: 0 var(--radius) var(--radius) 0;
	}

	h2 {
		font-size: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin-top: 1.75rem;
	}

	.examples {
		list-style: none;
		padding: 0;
	}

	.examples li {
		border-left: 4px solid var(--border);
		padding-left: 0.85rem;
		margin-bottom: 0.85rem;
	}

	.examples.non li {
		border-left-color: var(--caution-border);
	}

	.why {
		font-size: 0.9rem;
		color: var(--text-muted);
		margin-top: 0.25rem;
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

	.errata {
		margin-top: 1.5rem;
		font-size: 0.9rem;
	}
</style>
