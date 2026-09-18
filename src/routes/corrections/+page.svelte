<script lang="ts">
	import { resolve } from '$app/paths';
	import { correctionLog, termIndex } from '$lib/content/load.js';
	import { scenarios } from '$lib/content/scenarios.js';
	import { REPO_URL } from '$lib/config.js';

	const { corrections, flagged } = correctionLog;

	const fmtDate = (iso: string) =>
		new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});

	/*
	 * Only three kinds have a page of their own to link to. Anything else is named
	 * without a link rather than sent to a route that does not exist.
	 */
	const href = (kind: string, id: string): string | null => {
		if (kind === 'term') return resolve('/glossary/[slug]', { slug: id });
		if (kind === 'scenario') return resolve('/scenarios/[slug]', { slug: id });
		if (kind === 'ethics-topic') return resolve('/ethics/[slug]', { slug: id });
		return null;
	};

	/*
	 * A correction names ids without saying what kind each one is, so the kind is looked
	 * up rather than assumed. Guessing "term" would produce a dead link the moment a
	 * correction touched a situation — and a dead link on the page whose whole job is to
	 * be trustworthy is worse than plain text.
	 */
	const termIds = new Set(termIndex.map((t) => t.i));
	const scenarioIds = new Set(scenarios.map((s) => s.id));
	const linkFor = (id: string): string | null => {
		if (termIds.has(id)) return href('term', id);
		if (scenarioIds.has(id)) return href('scenario', id);
		return null;
	};

	const FOUND_BY: Record<string, string> = {
		'reader-report': 'Reported by a reader',
		review: 'Found in review',
		'source-check': 'Found checking the source',
		internal: 'Found internally'
	};
</script>

<svelte:head>
	<title>Corrections — ABA Assist</title>
	<meta
		name="description"
		content="Everything this app has told readers that turned out to be wrong, what it says now, and what is currently known to be wrong and not yet fixed."
	/>
</svelte:head>

<h1>Corrections</h1>

<p class="lede">
	Everything this app has told people that turned out to be wrong, what it says now, and what
	is known to be wrong and not fixed yet. Wrong content in this field is worse than missing
	content, and an app that asks you to report errors without ever showing what happened to any
	of them is asking you to take its word for it.
</p>

<section aria-labelledby="fixed">
	<h2 id="fixed" class="section-head">What has been corrected</h2>

	{#if corrections.length === 0}
		<p class="note" data-corrections="none">
			Nothing yet, and that is a statement about how far along this app is rather than about
			how careful it has been. Nothing here has reached readers: the site publishes as a
			preview, with the review banner on and search engines kept out, until its launch set has
			been through clinical review. This page starts filling the day that changes.
		</p>
	{:else}
		<ol class="log">
			{#each corrections as c (c.id)}
				<li data-severity={c.severity}>
					<h3>{c.summary}</h3>
					<p class="meta">
						{fmtDate(c.correctedOn)} ·
						<span class="tag"
							>{c.severity === 'material' ? 'Changed the advice' : 'Minor'}</span
						>
						· {FOUND_BY[c.foundBy] ?? c.foundBy}
					</p>
					<p><strong>It said:</strong> {c.wasWrong}</p>
					<p><strong>It now says:</strong> {c.nowSays}</p>
					<p class="affects">
						{#each c.affects as id (id)}
							{@const to = linkFor(id)}
							<!-- `to` is already resolved by `linkFor`; the rule cannot see through it. -->
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							{#if to}<a href={to}>{id}</a>{:else}<span>{id}</span>{/if}
						{/each}
					</p>
					{#if c.issueUrl}
						<p class="meta">
							<!-- An external tracker URL, not an app route. -->
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={c.issueUrl} rel="noopener">The report and the discussion</a>
						</p>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</section>

<section aria-labelledby="open">
	<h2 id="open" class="section-head">What is known to be wrong now</h2>

	<!--
		The harder half of the same promise. Anybody can list their fixes; saying "this one
		is wrong and we have not got to it" is the part that has to be true to be worth
		reading. Derived from the review status in the content files rather than written
		here, so it cannot quietly fall out of date.
	-->
	{#if flagged.length === 0}
		<p class="note" data-flagged="none">
			Nothing is currently flagged. Every entry either has been through review or is marked on
			its own page as not yet reviewed — which is a different thing, and said there rather than
			counted here.
		</p>
	{:else}
		<ul class="flagged">
			{#each flagged as f (f.id)}
				{@const to = href(f.kind, f.id)}
				<li>
					<!-- `to` is already resolved by `href`; the rule cannot see through it. -->
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					{#if to}<a href={to}>{f.title}</a>{:else}<span>{f.title}</span>{/if}
					<span class="meta">flagged in review, awaiting a fix</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section aria-labelledby="report">
	<h2 id="report" class="section-head">Found something wrong?</h2>
	<p>
		Report it. Reports are tracked in public, so you can see what was said and what was done
		about it — including the ones that turned out to be right as they were.
	</p>
	<p>
		<!-- An external GitHub URL, not an app route: resolve() does not apply. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a class="button" href="{REPO_URL}/issues/new?labels=content-error" rel="noopener">
			Report a content error
		</a>
	</p>
	<p class="note">
		<a href={resolve('/about')}>How the content is written and reviewed</a>, and when each
		restated fact is due to be checked against its source again.
	</p>
</section>

<style>
	.lede {
		color: var(--text-muted);
		max-width: 62ch;
	}

	.note {
		max-width: 62ch;
	}

	.log {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 1rem;
		max-width: 44rem;
	}

	.log li {
		padding: 0.75rem 1rem;
		border: 1px solid var(--border);
		border-left-width: 4px;
		border-radius: var(--radius);
		background: var(--surface-raised);
	}

	/*
	 * A thicker edge and a word, never the colour alone — the same rule the rest of the
	 * app follows for anything meaning "this one matters more".
	 */
	.log li[data-severity='material'] {
		border-left-color: var(--caution-border);
	}

	.log h3 {
		font-size: 1.05rem;
		margin: 0 0 0.25rem;
	}

	.log p {
		margin: 0.35rem 0;
	}

	.meta {
		color: var(--text-muted);
		font-size: 0.9em;
	}

	.tag {
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		font-size: 0.85em;
	}

	.affects a,
	.affects span {
		display: inline-block;
		margin: 0.15rem 0.35rem 0.15rem 0;
		font-size: 0.85em;
	}

	.flagged {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.4rem;
		max-width: 44rem;
	}

	.flagged li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--hair);
		border-radius: var(--radius);
	}
</style>
