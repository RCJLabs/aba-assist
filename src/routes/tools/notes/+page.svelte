<script lang="ts">
	import { resolve } from '$app/paths';
	import { termIndex } from '$lib/content/load.js';
	import { practiceGuideList } from '$lib/content/corpus.js';
	import { settings } from '$lib/state/settings.svelte.js';
	import { announcer } from '$lib/state/announcer.svelte.js';

	const termNames = new Map(termIndex.map((t) => [t.i, t.t]));

	const checklist = $derived(practiceGuideList.find((g) => g.kind === 'checklist'));
	const phrasing = $derived(practiceGuideList.find((g) => g.kind === 'phrasing'));

	function togglePlain() {
		settings.set('plainLanguage', !settings.plainLanguage);
		announcer.announce(
			settings.plainLanguage ? 'Showing plain language' : 'Showing the full explanation'
		);
	}

	// Ticking is a working aid for one note, not a record: nothing about a session should
	// outlive the session, so this is component state and is gone on navigation.
	let ticked = $state<Record<string, boolean>>({});
	const checkedCount = $derived(Object.values(ticked).filter(Boolean).length);
</script>

<svelte:head>
	<title>Writing session notes — ABA Assist</title>
	<meta
		name="description"
		content="What a session note usually has to carry, and how to turn an impression into something another person could have counted."
	/>
</svelte:head>

<nav aria-label="Breadcrumb" class="crumbs"><a href={resolve('/tools')}>Tools</a></nav>

<h1>Writing session notes</h1>

<div class="switcher">
	<button type="button" onclick={togglePlain} aria-pressed={settings.plainLanguage}>
		{settings.plainLanguage ? 'Show the full explanation' : 'Show plain language'}
	</button>
</div>

{#if checklist && checklist.kind === 'checklist'}
	<section>
		<h2>{checklist.title}</h2>
		<p class="summary" class:plain={settings.plainLanguage}>
			{settings.plainLanguage ? checklist.plainSummary : checklist.ourSummary}
		</p>
		<p class="who" role="note">{checklist.whoDecides}</p>

		<p class="progress" role="status">
			{checkedCount} of {checklist.items.length} ticked. This is scratch paper — nothing here is
			saved, on purpose.
		</p>

		<ul class="items">
			{#each checklist.items as item (item.id)}
				<li>
					<label>
						<input type="checkbox" bind:checked={ticked[item.id]} />
						<span class="label">{item.label}</span>
					</label>
					<p class="why">{item.why}</p>
					{#if item.example}
						<p class="example"><span class="tag">Like this</span> {item.example}</p>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if phrasing && phrasing.kind === 'phrasing'}
	<section>
		<h2>{phrasing.title}</h2>
		<p class="summary" class:plain={settings.plainLanguage}>
			{settings.plainLanguage ? phrasing.plainSummary : phrasing.ourSummary}
		</p>
		<p class="who" role="note">{phrasing.whoDecides}</p>

		<ul class="pairs">
			{#each phrasing.pairs as pair (pair.id)}
				<li>
					<p class="vague"><span class="tag">Instead of</span> {pair.vague}</p>
					<p class="objective"><span class="tag good">Write</span> {pair.objective}</p>
					<p class="why">{pair.why}</p>
				</li>
			{/each}
		</ul>

		{#if phrasing.termRefs.length > 0}
			<p class="related">
				Related terms:
				{#each phrasing.termRefs.filter((id) => termNames.has(id)) as id, i (id)}
					{#if i > 0},
					{/if}<a href={resolve('/glossary/[slug]', { slug: id })}>{termNames.get(id)}</a>
				{/each}
			</p>
		{/if}
	</section>
{/if}

<p class="note">
	Never put a client's name, initials, date of birth or address into an example, a search, or
	anything else in this app. The examples above are invented.
</p>

<style>
	h1 {
		font-size: 1.5rem;
	}
	.crumbs {
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
	}
	h2 {
		font-size: 1.2rem;
	}
	section {
		margin: 1.5rem 0;
	}
	.switcher button {
		min-height: var(--tap);
	}
	.who {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		border-radius: var(--radius);
		padding: 0.6rem 0.75rem;
		font-size: 0.95rem;
	}
	.progress,
	.why,
	.related,
	.note {
		color: var(--text-muted);
		font-size: 0.95rem;
	}
	.items,
	.pairs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.75rem;
	}
	.items li,
	.pairs li {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
		background: var(--surface-raised);
	}
	.items label {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		min-height: var(--tap);
		cursor: pointer;
	}
	.items input {
		margin-top: 0.35rem;
		width: 1.15rem;
		height: 1.15rem;
		flex: 0 0 auto;
	}
	.label {
		font-weight: 700;
	}
	.why {
		margin: 0.35rem 0 0;
	}
	.example,
	.vague,
	.objective {
		margin: 0.35rem 0 0;
	}
	/* Never colour alone: each line is also labelled in words. */
	.tag {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		margin-right: 0.35rem;
		color: var(--text-muted);
	}
	.tag.good {
		border-color: var(--accent);
		color: var(--accent);
	}
	.objective {
		font-weight: 600;
	}
	.note {
		border-top: 1px solid var(--border);
		padding-top: 0.75rem;
	}
</style>
