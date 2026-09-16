<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import ContentFilters from '$lib/components/ContentFilters.svelte';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { filters } from '$lib/state/filters.svelte.js';
	import { GRADES, study, type CardGrade } from '$lib/state/study.svelte.js';
	import { storage } from '$lib/state/storage.svelte.js';

	let nudgeDismissed = $state(false);

	onMount(() => {
		study.hydrate();
		void study.refresh();
		storage.load();
	});

	// The deck follows the filter. Reading the filter fields here is what re-runs the
	// counts when the reader changes a drop-down.
	$effect(() => {
		void filters.credential;
		void filters.domain;
		void filters.category;
		if (study.status === 'ready' || study.status === 'done') void study.refresh();
	});

	function reveal() {
		study.reveal();
		announcer.announce('Answer shown');
	}

	async function grade(g: CardGrade) {
		const label = GRADES.find((x) => x.grade === g)?.label ?? '';
		await study.grade(g);
		if (study.status === 'done') announcer.announce('Session complete');
		else announcer.announce(`${label}. Next card.`);
	}

	function onKey(e: KeyboardEvent) {
		if (study.status !== 'session') return;
		const target = e.target as HTMLElement | null;
		if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
		if (!study.revealed && (e.key === ' ' || e.key === 'Enter')) {
			e.preventDefault();
			reveal();
			return;
		}
		const hit = GRADES.find((g) => g.key === e.key);
		if (study.revealed && hit) {
			e.preventDefault();
			void grade(hit.grade);
		}
	}

	const front = $derived(study.term?.flashcard.front ?? study.term?.term ?? '');
	const back = $derived(study.term?.flashcard.back ?? study.term?.definition.plain ?? '');
	const canStart = $derived(study.stats.due + study.stats.fresh > 0);
</script>

<svelte:head>
	<title>Flashcards — ABA Assist</title>
	<meta
		name="description"
		content="Spaced-repetition flashcards over the glossary, filtered by exam, domain, or category. Everything stays on your device."
	/>
</svelte:head>

<svelte:window onkeydown={onKey} />

<h1>Flashcards</h1>

{#if storage.overdue && !nudgeDismissed && study.status !== 'session'}
	<!--
		Here rather than in a site-wide banner, and only outside a session.
		This is the page whose data hurts most to lose — spaced repetition is worth
		something only if the history survives — and the reader it warns is the one whose
		weekly visits are exactly what makes iOS decide the storage is not in use.
	-->
	<div class="nudge" role="note">
		<p>
			{#if storage.lastBackup === null}
				Your review history has never been backed up.
			{:else}
				Your last backup was {storage.daysSinceBackup} days ago.
			{/if}
			If this browser clears its storage, the schedule goes with it.
		</p>
		<div class="nudge-actions">
			<a class="button" href={resolve('/settings')}>Back it up</a>
			<button type="button" onclick={() => (nudgeDismissed = true)}>Not now</button>
		</div>
	</div>
{/if}

{#if study.status === 'session' && study.term}
	<section class="session" aria-labelledby="card-heading">
		<p class="progress">
			Card {study.progress.done + 1} of {study.progress.total}
			{#if filters.active}<span class="muted">· {filters.describe() || 'filtered'}</span>{/if}
		</p>

		<div class="card" data-revealed={study.revealed}>
			<h2 id="card-heading" class="front">{front}</h2>
			{#if study.term.aliases.length && !study.revealed}
				<p class="muted">Also called: {study.term.aliases.join(', ')}</p>
			{/if}

			{#if study.revealed}
				<div class="back">
					<p>{back}</p>
					{#if study.term.flashcard.mnemonic}
						<p class="mnemonic"><strong>Remember:</strong> {study.term.flashcard.mnemonic}</p>
					{/if}
					<p class="open">
						<a href={resolve('/glossary/[slug]', { slug: study.term.id })}
							>Open the full entry</a
						>
					</p>
				</div>
			{/if}
		</div>

		{#if !study.revealed}
			<button type="button" class="primary reveal" onclick={reveal}>Show answer</button>
			<p class="hint">Space or Enter also shows the answer.</p>
		{:else}
			<div class="grades" role="group" aria-label="How well did you know it?">
				{#each GRADES as g (g.grade)}
					<button type="button" class="grade grade-{g.grade}" onclick={() => grade(g.grade)}>
						<span class="label">{g.label}</span>
						<span class="when">{study.intervals?.[g.grade] ?? ''}</span>
						<span class="visually-hidden">, key {g.key}</span>
					</button>
				{/each}
			</div>
			<p class="hint">
				Keys 1 to 4 grade the card. The time under each button is when you will see it again.
			</p>
		{/if}

		<p><button type="button" onclick={() => study.end()}>End session</button></p>
	</section>
{:else if study.status === 'done'}
	<section class="summary" aria-labelledby="done-heading">
		<h2 id="done-heading">Session complete</h2>
		<p>
			You reviewed {study.session.reviewed}
			{study.session.reviewed === 1 ? 'card' : 'cards'}{#if study.session.again > 0}, and
				marked {study.session.again} to see again{/if}.
		</p>
		<p>
			<strong>{study.stats.due}</strong> due now · <strong>{study.stats.fresh}</strong> new
			available ·
			<strong>{study.stats.learned}</strong> in long-term review
		</p>
		<p>
			<button type="button" class="primary" onclick={() => study.start()} disabled={!canStart}
				>Study more</button
			>
			<button type="button" onclick={() => study.reset()}>Change the deck</button>
		</p>
	</section>
{:else}
	<p>
		Spaced repetition over the glossary. Each card shows a term; you reveal the plain-language
		definition and grade how well you knew it. Cards you find hard come back sooner. Everything
		is stored on this device.
	</p>

	<ContentFilters label="Choose the deck" />

	<div data-study-status={study.status} hidden></div>

	{#if study.status === 'unavailable'}
		<p class="warn">
			Flashcards need local storage, which this browser has blocked or which is unavailable in
			a private window. The glossary and everything else still work.
		</p>
	{:else}
		<dl class="stats" aria-live="polite">
			<div>
				<dt>Due now</dt>
				<dd>{study.stats.due}</dd>
			</div>
			<div>
				<dt>New this session</dt>
				<dd>{study.stats.fresh}</dd>
			</div>
			<div>
				<dt>Learned</dt>
				<dd>{study.stats.learned}</dd>
			</div>
			<div>
				<dt>In this deck</dt>
				<dd>{study.stats.inDeck}</dd>
			</div>
		</dl>

		<div class="per-session">
			<label for="new-per-session">New cards per session</label>
			<select
				id="new-per-session"
				value={String(study.newPerSession)}
				onchange={(e) => study.setNewPerSession(Number(e.currentTarget.value))}
			>
				<option value="5">5</option>
				<option value="10">10</option>
				<option value="20">20</option>
				<option value="40">40</option>
			</select>
		</div>

		<p>
			<button
				type="button"
				class="primary"
				onclick={() => study.start()}
				disabled={!canStart || study.status === 'loading'}
			>
				{study.status === 'loading' ? 'Loading…' : 'Start'}
			</button>
		</p>
		{#if study.status === 'ready' && !canStart}
			<p class="muted">
				Nothing is due in this deck and there are no new cards left in it. Widen the filter, or
				come back later.
			</p>
		{/if}
	{/if}
{/if}

<style>
	.nudge {
		border: 1px solid var(--caution-border);
		background: var(--caution-bg);
		color: var(--caution-text);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
		margin-bottom: 1rem;
	}
	.nudge p {
		margin: 0 0 0.5rem;
	}
	.nudge-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	h1 {
		font-size: 1.5rem;
	}
	.muted,
	.hint {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.warn {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
		margin: 1rem 0;
	}
	@media (min-width: 36rem) {
		.stats {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.stats div {
		background: var(--surface);
		border-radius: var(--radius);
		padding: 0.6rem 0.8rem;
	}
	.stats dt {
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.stats dd {
		margin: 0;
		font-size: 1.4rem;
		font-weight: 700;
	}
	.per-session {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		max-width: 14rem;
		margin-bottom: 1rem;
	}
	.per-session label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
	}
	.primary {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}
	.primary:hover {
		background: var(--accent);
		filter: brightness(1.1);
	}
	.primary:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.progress {
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		padding: 1.25rem 1rem;
		min-height: 10rem;
		margin-bottom: 1rem;
	}
	.front {
		font-size: 1.5rem;
		margin: 0 0 0.5rem;
	}
	.back p {
		font-size: 1.05rem;
	}
	.back {
		border-top: 1px solid var(--border);
		padding-top: 0.75rem;
	}
	.mnemonic {
		background: var(--surface);
		border-left: 4px solid var(--accent);
		padding: 0.5rem 0.75rem;
		border-radius: 0 var(--radius) var(--radius) 0;
	}
	.open {
		font-size: 0.9rem;
	}
	.reveal {
		width: 100%;
		font-size: 1.05rem;
		min-height: 3.25rem;
	}
	/*
	 * Four equal buttons in a row, each at least 44px tall and wide even at 320px
	 * (320 - 32 padding - 3 gaps of 8 = 264 / 4 = 66px). Tap is the primary interface;
	 * there is deliberately no swipe gesture (WCAG 2.5.1 / 2.5.7).
	 */
	.grades {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem;
	}
	.grade {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.1rem;
		min-height: 3.5rem;
		padding: 0.5rem 0.25rem;
		min-width: 0;
	}
	.grade .label {
		font-weight: 700;
	}
	.grade .when {
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	/* Colour reinforces the labels; it never replaces them. */
	.grade-1 {
		border-color: var(--stop-border);
	}
	.grade-4 {
		border-color: var(--accent);
	}
	.summary h2 {
		font-size: 1.2rem;
	}
</style>
