<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import DataLostNotice from '$lib/components/DataLostNotice.svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import ContentFilters from '$lib/components/ContentFilters.svelte';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { filters } from '$lib/state/filters.svelte.js';
	import { GRADES, study, type CardGrade } from '$lib/state/study.svelte.js';
	import { CATEGORY_LABELS } from '$lib/content/load.js';
	import { storage } from '$lib/state/storage.svelte.js';

	let nudgeDismissed = $state(false);
	/**
	 * What the reader wrote, before they saw the answer.
	 *
	 * Page state, never stored. It exists to be put beside the definition for the few
	 * seconds it takes to grade, and a store for it would mean a migration, a backup entry
	 * and a second place free text lives — for something nobody would ever read again.
	 */
	let attempt = $state('');
	let gradesEl = $state<HTMLDivElement | undefined>();

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
		/*
		 * Move focus off the textarea. The key handler correctly ignores 1 to 4 while a
		 * textarea has focus, so without this a reader who typed their answer would find the
		 * grade keys dead and no explanation on screen for why.
		 */
		if (study.recall) queueMicrotask(() => gradesEl?.querySelector('button')?.focus());
	}

	async function grade(g: CardGrade) {
		const label = GRADES.find((x) => x.grade === g)?.label ?? '';
		await study.grade(g);
		attempt = '';
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

	/** Cards still to see after this one, which is what the stack behind the card shows. */
	const remaining = $derived(Math.max(0, study.progress.total - study.progress.done - 1));

	/** How many of each grade this session, for the tally and the summary breakdown. */
	const tally = $derived.by(() => {
		const out: Record<CardGrade, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
		for (const g of study.graded) out[g] += 1;
		return out;
	});
</script>

<Seo
	title="Flashcards"
	description="Spaced-repetition flashcards over the glossary, filtered by exam, domain, or category. Everything stays on your device."
/>

<svelte:window onkeydown={onKey} />

<h1>Flashcards</h1>

<DataLostNotice />

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
		<!--
			One segment per card graded so far, in order, plus the ones still to come.
			`role="progressbar"` carries the position for a screen reader; the segments are
			decoration on top of it, and the tally below says the same thing in words so
			the colours are never the only signal.
		-->
		<div
			class="bar"
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={study.progress.total}
			aria-valuenow={study.progress.done}
			aria-label="Cards graded"
		>
			{#each study.graded as g, i (i)}
				<span class="seg" data-grade={g} aria-hidden="true"></span>
			{/each}
			{#each { length: Math.max(0, study.progress.total - study.graded.length) }, i (i)}
				<span class="seg" data-grade="0" aria-hidden="true"></span>
			{/each}
		</div>

		<p class="progress">
			Card {study.progress.done + 1} of {study.progress.total}
			{#if study.term.category}<span class="chip">{CATEGORY_LABELS[study.term.category]}</span
				>{/if}
			{#if filters.active}<span class="muted">· {filters.describe() || 'filtered'}</span>{/if}
		</p>

		<!--
			The stack is the remaining queue, drawn. Two edges at most: a third reads as
			clutter at 320px and says nothing the count above does not.
		-->
		<div class="stack" data-behind={Math.min(2, remaining)}>
			<!--
				Keyed on `revealed` so the card animates each time it turns. The animation is
				a turn rather than a true two-sided flip because the back is taller than the
				front and a backface-hidden pair needs a fixed height, which breaks at 200%
				zoom and at 320px. Reduced motion removes it entirely.
			-->
			{#key study.revealed}
				<div class="card" data-revealed={study.revealed}>
					<p class="face" aria-hidden="true">{study.revealed ? 'Answer' : 'Term'}</p>
					<h2 id="card-heading" class="front">{front}</h2>
					{#if study.term.aliases.length && !study.revealed}
						<p class="muted">Also called: {study.term.aliases.join(', ')}</p>
					{/if}

					{#if study.revealed}
						<div class="back">
							{#if study.recall}
								<!--
									Their words first, then the definition. This is the whole mechanism:
									"I knew that" is much harder to tell yourself with what you actually
									wrote sitting directly above what the answer was.
								-->
								<div class="compare">
									<p class="mine" data-attempt={attempt.trim() === '' ? 'blank' : 'written'}>
										{attempt.trim() === '' ? 'You did not write anything.' : attempt}
									</p>
								</div>
							{/if}
							<p>{back}</p>
							{#if study.term.flashcard.mnemonic}
								<p class="mnemonic">
									<strong>Remember:</strong>
									{study.term.flashcard.mnemonic}
								</p>
							{/if}
							<p class="open">
								<a href={resolve('/glossary/[slug]', { slug: study.term.id })}
									>Open the full entry</a
								>
							</p>
						</div>
					{:else if study.recall}
						<div class="field">
							<label for="recall-attempt">Write the definition, then check</label>
							<textarea
								id="recall-attempt"
								rows="3"
								bind:value={attempt}
								placeholder="In your own words…"></textarea>
						</div>
					{:else}
						<p class="prompt" aria-hidden="true">Can you define it?</p>
					{/if}
				</div>
			{/key}
		</div>

		{#if !study.revealed}
			<button type="button" class="primary reveal" onclick={reveal}>
				{study.recall ? 'Check it' : 'Show answer'}
			</button>
			<p class="hint">
				{#if study.recall}
					Checking with the box empty is allowed — not being able to write it is an answer, and
					it is the one worth grading honestly.
				{:else}
					Space or Enter also shows the answer.
				{/if}
			</p>
		{:else}
			<div
				class="grades"
				role="group"
				aria-label="How well did you know it?"
				bind:this={gradesEl}
			>
				{#each GRADES as g (g.grade)}
					<button type="button" class="grade grade-{g.grade}" onclick={() => grade(g.grade)}>
						<span class="label">{g.label}</span>
						<span class="when">{study.intervals?.[g.grade] ?? ''}</span>
						<span class="key" aria-hidden="true">{g.key}</span>
						<span class="visually-hidden">, key {g.key}</span>
					</button>
				{/each}
			</div>
			<p class="hint">
				Keys 1 to 4 grade the card. The time under each button is when you will see it again.
			</p>
		{/if}

		{#if study.session.reviewed > 0}
			<p class="tally" aria-live="polite">
				{#each GRADES as g (g.grade)}
					{#if tally[g.grade] > 0}
						<span class="chip" data-grade={g.grade}>{g.label} {tally[g.grade]}</span>
					{/if}
				{/each}
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

		{#if study.session.reviewed > 0}
			<!--
				How the session went, by grade. A row of bars rather than a chart: four
				numbers do not need axes, and each bar carries its own label and count so
				the width is a second reading of the number rather than the only one.
			-->
			<ul class="breakdown">
				{#each GRADES as g (g.grade)}
					<li>
						<span class="b-label">{g.label}</span>
						<span class="b-track" aria-hidden="true">
							<span
								class="b-fill"
								data-grade={g.grade}
								style="width: {study.session.reviewed > 0
									? (tally[g.grade] / study.session.reviewed) * 100
									: 0}%"
							></span>
						</span>
						<span class="b-count">{tally[g.grade]}</span>
					</li>
				{/each}
			</ul>
		{/if}
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
		<!--
			This session in the context of every other one. The bars above say how the last
			ten minutes went; they cannot say whether any of it is being retained.
		-->
		<p class="over-time">
			<a href={resolve('/progress')}>How it is going over time</a> — whether these cards are actually
			sticking.
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

		<label class="recall-toggle">
			<input
				type="checkbox"
				checked={study.recall}
				onchange={(e) => study.setRecall(e.currentTarget.checked)}
			/>
			<span>
				<strong>Write it before you check</strong>
				<span class="why">
					Turning a card over and grading yourself is recognition — the answer is on screen, it
					looks familiar, and familiarity is not recall. Writing first puts your words next to
					the definition. Slower, and harder to fool yourself with.
				</span>
			</span>
		</label>

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
	/*
	 * Grade colours, defined once. Every use pairs them with a label or a count, so they
	 * reinforce a reading rather than being one; "0" is the not-yet-graded track.
	 */
	.bar,
	.tally,
	.breakdown {
		--g0: var(--border);
		--g1: var(--stop-border);
		--g2: var(--caution-border);
		--g3: var(--accent);
		--g4: var(--accent);
	}

	.bar {
		display: flex;
		gap: 2px;
		margin: 0 0 0.5rem;
		height: 6px;
	}
	.seg {
		flex: 1 1 0;
		min-width: 2px;
		border-radius: 2px;
		background: var(--g0);
	}
	.seg[data-grade='1'] {
		background: var(--g1);
	}
	.seg[data-grade='2'] {
		background: var(--g2);
	}
	.seg[data-grade='3'] {
		background: var(--g3);
		opacity: 0.6;
	}
	.seg[data-grade='4'] {
		background: var(--g4);
	}

	.chip {
		display: inline-block;
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.tally {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0.75rem 0 0;
	}
	.tally .chip[data-grade='1'] {
		border-color: var(--g1);
	}
	.tally .chip[data-grade='2'] {
		border-color: var(--g2);
	}
	.tally .chip[data-grade='3'],
	.tally .chip[data-grade='4'] {
		border-color: var(--g3);
	}

	/*
	 * The queue, drawn behind the card. Pseudo-elements rather than real nodes: they are
	 * decoration, and a screen reader should not meet two empty cards before the real one.
	 */
	/*
	 * The edges sit inside the stack's own box rather than offset out of it. Translating
	 * them outward looked right on a wide screen and pushed past the gutter at 320px,
	 * where the page must not scroll sideways.
	 */
	.stack {
		position: relative;
		margin-bottom: 1.25rem;
		padding-bottom: 22px;
	}
	.stack::before,
	.stack::after {
		content: '';
		position: absolute;
		top: 0;
		height: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.stack::before {
		left: 8px;
		right: 8px;
		transform: translateY(8px);
	}
	.stack::after {
		left: 16px;
		right: 16px;
		transform: translateY(16px);
		opacity: 0.55;
	}
	.stack[data-behind='0']::before,
	.stack[data-behind='0']::after,
	.stack[data-behind='1']::after {
		display: none;
	}

	.card {
		/*
		 * Above the two stack edges. They are ordinary positioned pseudo-elements rather
		 * than negative-z-index ones: a negative z-index paints behind the nearest
		 * ancestor with a background, which on this page meant behind the page itself.
		 */
		position: relative;
		z-index: 1;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		padding: 1.25rem 1rem;
		min-height: 10rem;
		transform-origin: left center;
		animation: turn 260ms ease-out;
	}
	.card[data-revealed='true'] {
		border-color: var(--accent);
	}
	@keyframes turn {
		from {
			transform: perspective(900px) rotateY(-24deg);
			opacity: 0.4;
		}
		to {
			transform: perspective(900px) rotateY(0);
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card {
			animation: none;
		}
	}

	.face {
		margin: 0 0 0.25rem;
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.prompt {
		margin: 1rem 0 0;
		color: var(--text-muted);
		font-style: italic;
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
	.recall-toggle {
		display: flex;
		gap: 0.6rem;
		align-items: start;
		max-width: 46rem;
		margin: 0.75rem 0;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--hair);
		border-radius: var(--radius);
		background: var(--surface-raised);
		cursor: pointer;
	}

	.recall-toggle input {
		margin-top: 0.15rem;
		min-width: 1.15rem;
		min-height: 1.15rem;
	}

	.recall-toggle span {
		display: grid;
		gap: 0.15rem;
	}

	.why {
		color: var(--text-muted);
		font-size: 0.92em;
	}

	.field {
		display: grid;
		gap: 0.25rem;
		margin-top: 0.5rem;
		text-align: left;
	}

	.field textarea {
		width: 100%;
		font: inherit;
	}

	/*
	 * The reader's attempt, marked off from the definition rather than styled to look like
	 * one. Two paragraphs of prose with nothing between them would read as one answer.
	 */
	.compare .mine {
		margin: 0 0 0.6rem;
		padding: 0.5rem 0.6rem;
		border-left: 4px solid var(--border);
		background: var(--surface);
		border-radius: 0 var(--radius) var(--radius) 0;
		white-space: pre-wrap;
	}

	.compare .mine[data-attempt='blank'] {
		color: var(--text-muted);
		font-style: italic;
	}

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
	/*
	 * The keyboard number, on pointers that have a keyboard beside them. Hidden on touch,
	 * where it is a number with nothing to press and the buttons are already tight at
	 * 320px. The visually-hidden copy is always there for a screen reader.
	 */
	.grade .key {
		display: none;
		font-size: 0.7rem;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 0 0.25rem;
		line-height: 1.3;
	}
	@media (hover: hover) and (pointer: fine) {
		.grade .key {
			display: inline-block;
		}
	}
	/* Colour reinforces the labels; it never replaces them. */
	.grade-1 {
		border-color: var(--stop-border);
	}
	.grade-2 {
		border-color: var(--caution-border);
	}
	.grade-3 {
		border-color: var(--accent);
		opacity: 0.85;
	}
	.grade-4 {
		border-color: var(--accent);
	}
	.summary h2 {
		font-size: 1.2rem;
	}

	.breakdown {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
		display: grid;
		gap: 0.35rem;
	}
	.breakdown li {
		display: grid;
		grid-template-columns: 4rem 1fr 2rem;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}
	.b-track {
		height: 0.6rem;
		border-radius: 999px;
		background: var(--surface);
		overflow: hidden;
	}
	.b-fill {
		display: block;
		height: 100%;
		background: var(--g0);
	}
	.b-fill[data-grade='1'] {
		background: var(--g1);
	}
	.b-fill[data-grade='2'] {
		background: var(--g2);
	}
	.b-fill[data-grade='3'] {
		background: var(--g3);
		opacity: 0.6;
	}
	.b-fill[data-grade='4'] {
		background: var(--g4);
	}
	.b-count {
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
</style>
