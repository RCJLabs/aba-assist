<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { intervalTimer as t } from '$lib/state/timer.svelte.js';
	import { loadTerm, termIndex } from '$lib/content/load.js';
	import { practiceGuideList } from '$lib/content/corpus.js';
	import { quickLookup } from '$lib/tools/lookup.js';
	import {
		clock,
		INTERVAL_CHOICES,
		LENGTH_CHOICES,
		METHODS,
		methodInfo,
		type Method
	} from '$lib/tools/interval.js';
	import type { Term } from '@aba/content-schema';

	const uid = $props.id();

	onMount(() => {
		t.load();
		const onVisible = () => {
			if (document.visibilityState === 'visible') t.resync();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			// Same as the standalone timer: a session that is over is over, and a clock
			// still running on a page nobody is looking at would cue into an empty room.
			t.reset();
		};
	});

	const info = $derived(methodInfo(t.method));
	const pos = $derived(t.position);
	const summary = $derived(t.tally);
	const running = $derived(t.status === 'running');

	/*
	 * Lookup, inline and going nowhere.
	 *
	 * The point of this page is that checking what a word means does not cost you the
	 * session. A link out would stop the clock and lose the tally, so results open in
	 * place: the gloss comes from the term index that is already in memory, and the plain
	 * definition is fetched from its category bucket only when somebody actually asks for
	 * one. The full entry is offered once the clock is not running.
	 */
	let query = $state('');
	const hits = $derived(quickLookup(termIndex, query));
	let openId = $state<string | null>(null);
	let opened = $state<Term | null>(null);

	async function open(id: string) {
		if (openId === id) {
			openId = null;
			opened = null;
			return;
		}
		openId = id;
		opened = null;
		const term = await loadTerm(id);
		// Another result may have been tapped while this was loading.
		if (openId === id) opened = term ?? null;
	}

	const checklist = $derived(practiceGuideList.find((g) => g.kind === 'checklist'));
	// Scratch paper for one note, deliberately not stored: nothing about a session should
	// outlive the session.
	let ticked = $state<Record<string, boolean>>({});
	const tickedCount = $derived(Object.values(ticked).filter(Boolean).length);

	async function start() {
		await t.start();
		announcer.announce(
			`Session started. ${t.plan.intervals} intervals of ${t.intervalSeconds} seconds.`
		);
	}

	function score(value: boolean) {
		t.scoreCurrent(value);
		announcer.announce(value ? 'Scored yes' : 'Scored no');
	}
</script>

<Seo
	title="Session mode"
	description="One screen for use during a session: the interval timer, what a session note has to carry, and a definition lookup that does not cost you the clock."
/>

<div data-session-status={t.status} hidden></div>

{#if t.status === 'idle'}
	<h1>Session mode</h1>
	<p class="lede">
		One screen for while you are running a session: the interval cue, the note checklist, and a
		lookup that answers without taking you off the page. Nothing here is saved.
	</p>

	<fieldset class="methods">
		<legend>What you are recording</legend>
		{#each METHODS as m (m.id)}
			<label class="method" class:on={t.method === m.id}>
				<input
					type="radio"
					name="method"
					value={m.id}
					checked={t.method === m.id}
					onchange={() => (t.method = m.id as Method)}
				/>
				<span class="name">{m.label}</span>
				<span class="prompt">{m.prompt}</span>
			</label>
		{/each}
	</fieldset>

	<!--
		label/for rather than a label wrapped round the select. Wrapping makes the select's
		accessible name its own contents as well, so a screen reader announces "Interval,
		5 seconds, 6 seconds, 10 seconds…" — the whole option list, every time it is focused.
	-->
	<div class="row">
		<div class="field">
			<label for="{uid}-interval">Interval</label>
			<select id="{uid}-interval" bind:value={t.intervalSeconds}>
				{#each INTERVAL_CHOICES as s (s)}
					<option value={s}>{s} seconds</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="{uid}-length">Length</label>
			<select id="{uid}-length" bind:value={t.totalMinutes}>
				{#each LENGTH_CHOICES as m (m)}
					<option value={m}>{m} minutes</option>
				{/each}
			</select>
		</div>
	</div>

	<p class="plan">{t.plan.intervals} intervals.</p>
	<button type="button" class="go" onclick={start}>Start the session</button>

	<p class="note" role="note">
		This records nothing and sends nothing. The tally is on screen only, and it is gone when
		you leave — it is a counting aid, not a data sheet, and your employer's system is where the
		session actually gets recorded.
	</p>
{:else}
	<div class="bar">
		<div class="countdown">
			<strong role="timer" aria-label="Time left in this interval"
				>{clock(pos.remainingMs)}</strong
			>
			<span>Interval {Math.min(pos.index + 1, t.plan.intervals)} of {t.plan.intervals}</span>
		</div>
		<div class="tally" role="status">
			<!-- No percentage until something has been scored: nought out of nought is not 0%. -->
			<strong>{summary.percent === null ? '—' : `${summary.percent}%`}</strong>
			<span>{summary.scored} of {t.plan.intervals} scored</span>
		</div>
	</div>

	{#if running}
		<p class="prompt-now">{info.prompt}</p>
		<div class="score">
			<button type="button" class="yes" onclick={() => score(true)}>Yes</button>
			<button type="button" class="no" onclick={() => score(false)}>No</button>
		</div>
		<button type="button" class="stop" onclick={() => t.finish()}>Stop</button>
	{:else}
		<p class="done" role="status">
			{#if summary.percent === null}
				Finished, with nothing scored.
			{:else}
				Finished. {summary.percent}% of the {summary.scored} intervals you scored.
			{/if}
		</p>
		<button type="button" class="go" onclick={() => t.reset()}>New session</button>
	{/if}

	<details class="panel">
		<summary>Look something up</summary>
		<div class="field">
			<label for="{uid}-lookup">Find a term</label>
			<input
				id="{uid}-lookup"
				type="search"
				bind:value={query}
				placeholder="A word, or the letters you heard"
				autocomplete="off"
				spellcheck="false"
			/>
		</div>

		{#if query.trim().length >= 2 && hits.length === 0}
			<p class="empty">Nothing matches that.</p>
		{/if}

		<ul class="hits">
			{#each hits as hit (hit.i)}
				<li>
					<button
						type="button"
						aria-expanded={openId === hit.i}
						aria-controls="{uid}-{hit.i}"
						onclick={() => open(hit.i)}
					>
						<strong>{hit.t}</strong>
						<span>{hit.g}</span>
					</button>
					{#if openId === hit.i}
						<div class="detail" id="{uid}-{hit.i}">
							{#if opened}
								<p>{opened.definition.plain}</p>
								{#if opened.examples[0]}
									<p class="eg"><span class="tag">Like</span> {opened.examples[0].text}</p>
								{/if}
								{#if !running}
									<a href={resolve('/glossary/[slug]', { slug: hit.i })}>The full entry</a>
								{/if}
							{:else}
								<p class="loading">Opening…</p>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if running}
			<p class="stays" role="note">
				Definitions open here rather than on their own page, so looking one up does not stop
				the clock or lose the tally.
			</p>
		{/if}
	</details>

	{#if checklist && checklist.kind === 'checklist'}
		<details class="panel">
			<summary>The note ({tickedCount} of {checklist.items.length})</summary>
			<p class="scratch" role="status">Scratch paper. Nothing here is saved, on purpose.</p>
			<ul class="items">
				{#each checklist.items as item (item.id)}
					<li>
						<label>
							<input type="checkbox" bind:checked={ticked[item.id]} />
							<span>{item.label}</span>
						</label>
					</li>
				{/each}
			</ul>
			<p class="who" role="note">{checklist.whoDecides}</p>
		</details>
	{/if}
{/if}

<style>
	h1 {
		font-size: 1.5rem;
	}

	.lede {
		color: var(--text-muted);
		margin-top: 0;
	}

	.methods {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.5rem;
		margin: 1rem 0;
	}

	legend {
		font-weight: 600;
		padding: 0 0.3rem;
	}

	.method {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.1rem 0.6rem;
		align-items: center;
		padding: 0.5rem;
		min-height: var(--tap);
		border-radius: var(--radius);
	}

	.method input {
		grid-row: span 2;
		width: 1.15rem;
		height: 1.15rem;
	}

	.method .name {
		font-weight: 600;
	}

	.method .prompt {
		grid-column: 2;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.method.on {
		background: var(--surface);
		box-shadow: inset 0 0 0 2px var(--accent);
	}

	.row {
		display: flex;
		gap: 0.75rem;
	}

	.field {
		display: block;
		flex: 1;
		margin-bottom: 0.75rem;
	}

	.field label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	/* Selects take their chrome from app.css, including the room the chevron needs. */
	.field input {
		width: 100%;
		min-height: var(--tap);
		padding: 0.5rem;
		font-size: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
	}

	.plan {
		color: var(--text-muted);
		margin: 0 0 0.75rem;
	}

	.go,
	.stop {
		width: 100%;
		min-height: var(--tap);
		font-size: 1rem;
		font-weight: 600;
	}

	.stop {
		margin-top: 0.75rem;
	}

	/*
	 * The clock stays put while the panels below are used. Sticky rather than fixed so it
	 * cannot cover a focused control further down the page (2.4.11), and it sits inside the
	 * normal flow so nothing is ever obscured at any scroll position.
	 */
	.bar {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem 0.75rem;
		margin-bottom: 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.countdown strong {
		display: block;
		font-size: 2rem;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}

	.tally {
		text-align: right;
	}

	.tally strong {
		display: block;
		font-size: 1.5rem;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}

	.countdown span,
	.tally span {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.prompt-now {
		margin: 0 0 0.5rem;
		font-weight: 600;
	}

	/* Two targets, thumb-sized, because this is tapped without looking. */
	.score {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.score button {
		min-height: 3.5rem;
		font-size: 1.1rem;
		font-weight: 700;
	}

	.panel {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		margin-top: 0.75rem;
		padding: 0.25rem 0.75rem;
	}

	summary {
		min-height: var(--tap);
		display: flex;
		align-items: center;
		font-weight: 600;
		cursor: pointer;
	}

	.hits {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.hits > li {
		border-top: 1px solid var(--border);
	}

	.hits button {
		display: block;
		width: 100%;
		text-align: left;
		min-height: var(--tap);
		padding: 0.5rem 0.25rem;
		background: none;
		border: none;
		color: var(--text);
	}

	.hits button span {
		display: block;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.detail {
		padding: 0 0.25rem 0.6rem;
	}

	.detail p {
		margin: 0 0 0.4rem;
	}

	.tag {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.items {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.items label {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: var(--tap);
	}

	.items input {
		width: 1.15rem;
		height: 1.15rem;
		flex: 0 0 auto;
	}

	.note,
	.who,
	.stays,
	.scratch,
	.empty,
	.loading {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.note {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem;
		margin-top: 1rem;
	}

	.done {
		font-weight: 600;
	}
</style>
