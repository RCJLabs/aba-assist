<script lang="ts">
	import { resolve } from '$app/paths';
	import { CREDENTIAL_LABELS } from '$lib/content/corpus.js';
	import { settings } from '$lib/state/settings.svelte.js';
	import { filters, type CredentialFilter } from '$lib/state/filters.svelte.js';
	import { errataUrl } from '$lib/config.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const o = $derived(data.outline);
	const facts = $derived(data.facts);
	const taskCount = $derived(o.domains.reduce((n, d) => n + d.tasks.length, 0));

	function studyThis(domain: string) {
		filters.set({ credential: o.credential as CredentialFilter, domain, category: 'all' });
	}

	const fmtDate = (iso: string) =>
		new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});

	const examFormatLine = $derived.by(() => {
		const parts = [`The exam has ${o.exam.scoredItems} scored questions`];
		if (o.exam.unscoredItems) parts.push(`plus ${o.exam.unscoredItems} unscored`);
		const sentence = parts.join(' ');
		return o.exam.minutes ? `${sentence}, in ${o.exam.minutes} minutes.` : `${sentence}.`;
	});
</script>

<svelte:head>
	<title>{o.credential} exam outline ({o.edition} ed.) — ABA Assist</title>
	<meta
		name="description"
		content="The {o.credential} Test Content Outline ({o.edition} ed.): content areas, exam weights, and our summaries of each task, with links to the glossary."
	/>
</svelte:head>

<nav aria-label="Breadcrumb" class="crumbs">
	<a href={resolve('/exams')}>Exams</a>
</nav>

<!--
	Built here rather than inline. A `{#if}` boundary inside a sentence swallows the
	whitespace around it, which is how "150 scored questions" and "plus 25 unscored" came
	to render as "questionsplus".
-->
<h1>{o.credential} — {CREDENTIAL_LABELS[o.credential] ?? o.credential}</h1>
<p class="lede">
	Test Content Outline, {o.edition} edition, effective {fmtDate(o.effectiveDate)}.
	{#if o.exam.scoredItems}
		{examFormatLine}
	{/if}
</p>

<div class="actions">
	<a class="button" href={resolve('/quiz')} onclick={() => studyThis('all')}
		>Practice questions</a
	>
	<a class="button" href={resolve('/study')} onclick={() => studyThis('all')}
		>Flashcards for this exam</a
	>
	<a class="button" href={resolve('/ethics')}>Ethics reference</a>
	<button
		type="button"
		onclick={() => settings.set('plainLanguage', !settings.plainLanguage)}
		aria-pressed={settings.plainLanguage}
	>
		{settings.plainLanguage ? 'Show technical wording' : 'Show plain language'}
	</button>
</div>

{#if !o.countsVerified}
	<div class="notice" role="note">
		<strong>Task list pending.</strong> The {o.domains.length} content areas, their weights, and
		the exam format below are verified from the official documents. The individual task codes have
		not yet been checked against the outline itself, so they are not listed. Terms are tagged to
		the areas instead.
	</div>
{/if}

<h2>Content areas</h2>
<p class="muted">
	{o.domains.length} areas{#if o.countsVerified}, {taskCount} tasks{/if}. The bar shows each
	area's share of the exam.
</p>

<ol class="domains">
	{#each o.domains as d (d.letter)}
		<li id="domain-{d.letter}">
			<h3>{d.letter}. {d.name}</h3>
			<p class="weight">
				<span class="bar" aria-hidden="true"
					><span style="width: {d.examWeightPercent ?? 0}%"></span></span
				>
				<span>
					{#if d.examWeightPercent !== null}{d.examWeightPercent}% of the exam{/if}
					{#if d.examItems !== null}· {d.examItems} questions{/if}
					{#if d.tasks.length}· {d.tasks.length} tasks{/if}
				</span>
			</p>
			<p>{d.ourDescription}</p>

			{#if d.tasks.length > 0}
				<ul class="tasks">
					{#each d.tasks as t (t.code)}
						<li class="task">
							<span class="code">{t.code}</span>
							<span class="summary">
								<span hidden={settings.plainLanguage}>{t.ourSummary}</span>
								<span hidden={!settings.plainLanguage}>{t.plainSummary}</span>
							</span>
							{#if t.termRefs.length}
								<span class="links">
									{#each t.termRefs as id (id)}
										{#if data.termNames[id]}
											<a href={resolve('/glossary/[slug]', { slug: id })}
												>{data.termNames[id]}</a
											>
										{/if}
									{/each}
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if data.termsByDomain[d.letter]?.length}
				<details>
					<summary>{data.termsByDomain[d.letter].length} glossary terms in this area</summary>
					<ul class="termlist">
						{#each data.termsByDomain[d.letter] as t (t.id)}
							<li><a href={resolve('/glossary/[slug]', { slug: t.id })}>{t.name}</a></li>
						{/each}
					</ul>
				</details>
			{/if}

			<p class="domain-actions">
				<a href={resolve('/quiz')} onclick={() => studyThis(d.letter)}>Practice this area</a>
				·
				<a href={resolve('/study')} onclick={() => studyThis(d.letter)}
					>Flashcards for this area</a
				>
			</p>
		</li>
	{/each}
</ol>

{#if facts}
	<h2>Certification requirements</h2>
	<p class="muted">
		Checked against the {facts.handbookVersion} version of the handbook. Requirements change;
		<!-- The official handbook is an external document, not an app route. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href={facts.officialUrl} rel="noopener">the official handbook</a> is the authority.
	</p>
	<p>{facts.ourOverview}</p>

	{#each facts.sections as s (s.id)}
		<section class="facts" id="facts-{s.id}">
			<h3>{s.title}</h3>
			{#if s.ourNote}<p class="note">{s.ourNote}</p>{/if}
			<dl>
				{#each s.items as item, i (i)}
					<dt>{item.label}</dt>
					<dd>
						{item.value}
						{#if item.locator}<span class="loc">({item.locator})</span>{/if}
					</dd>
				{/each}
			</dl>
		</section>
	{/each}
{/if}

<section class="sources">
	<h2>About this page</h2>
	<p>
		Content-area names, task codes, counts and weights are facts taken from the official
		outline and handbook. The task summaries and descriptions are written by us and are not the
		document's wording; read the official outline for the exact task statements. This app is
		not affiliated with, endorsed by, or sponsored by any certifying body.
	</p>
	{#if o.review.status !== 'approved'}
		<p class="unreviewed">
			The summaries on this page have not yet been through independent review.
		</p>
	{/if}
	<p>
		<!-- External GitHub URL, not an app route. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href={errataUrl(`${o.credential} outline page`)} rel="noopener"
			>Something wrong here? Report it.</a
		>
	</p>
</section>

<style>
	.crumbs {
		font-size: 0.9rem;
	}
	h1 {
		font-size: 1.5rem;
		margin-bottom: 0.25rem;
	}
	.lede {
		color: var(--text-muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0;
	}
	.button {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}
	.notice {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius);
	}
	h2 {
		font-size: 1.15rem;
		margin-top: 2rem;
	}
	h3 {
		font-size: 1.05rem;
		margin-bottom: 0.25rem;
	}
	.muted,
	.note {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.domains {
		list-style: none;
		padding: 0;
	}
	.domains > li {
		border-top: 1px solid var(--border);
		padding: 1rem 0;
	}
	.weight {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.9rem;
		color: var(--text-muted);
		margin: 0.25rem 0 0.5rem;
	}
	.bar {
		display: inline-block;
		flex: 0 0 6rem;
		height: 0.6rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		overflow: hidden;
	}
	.bar > span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	.tasks {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0;
	}
	.task {
		display: grid;
		grid-template-columns: 3.5rem 1fr;
		gap: 0.25rem 0.5rem;
		padding: 0.5rem 0;
		border-top: 1px dashed var(--border);
	}
	.code {
		font-weight: 700;
		color: var(--link);
		font-variant-numeric: tabular-nums;
	}
	.links {
		grid-column: 2;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.75rem;
	}
	.links a {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.85rem;
		text-decoration: none;
	}
	details {
		margin: 0.5rem 0;
	}
	summary {
		display: flex;
		align-items: center;
		min-height: var(--tap);
		cursor: pointer;
		color: var(--link);
	}
	.termlist {
		list-style: none;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.75rem;
	}
	.termlist a {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.85rem;
		text-decoration: none;
	}
	.domain-actions {
		font-size: 0.9rem;
	}
	.domain-actions a {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
	}
	.facts {
		margin-top: 1rem;
	}
	.facts dl {
		display: grid;
		grid-template-columns: minmax(7rem, 11rem) 1fr;
		gap: 0.4rem 1rem;
		font-size: 0.95rem;
	}
	.facts dt {
		font-weight: 600;
		color: var(--text-muted);
	}
	.facts dd {
		margin: 0;
	}
	.loc {
		display: block;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	@media (max-width: 30rem) {
		.facts dl {
			grid-template-columns: 1fr;
			gap: 0.1rem 0;
		}
		.facts dd {
			margin-bottom: 0.6rem;
		}
	}
	.sources {
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.unreviewed {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius);
	}
</style>
