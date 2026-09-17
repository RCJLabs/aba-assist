<script lang="ts">
	import { resolve } from '$app/paths';
	import { CATEGORY_LABELS } from '@aba/content-schema/runtime';
	import type { PairDrill, TermCategory } from '@aba/content-schema';
	import { loadPairDrills, termIndex } from '$lib/content/load.js';
	import { study } from '$lib/state/study.svelte.js';
	import { recordSitting } from '$lib/state/drills.js';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import {
		availableCategories,
		buildSession,
		termsBehind,
		type PairQuestion
	} from '$lib/drills/pairs.js';

	const uid = $props.id();
	const SIZE = 15;

	let bank = $state<PairDrill[] | null>(null);
	let chosen = $state<TermCategory[]>([]);
	let session = $state<PairQuestion[]>([]);
	let at = $state(0);
	let picked = $state<string | null>(null);
	let missed = $state<PairQuestion[]>([]);
	let reinforced = $state(0);
	let startedAt = $state(0);
	/**
	 * Whether this sitting has reached the history yet.
	 *
	 * Observable rather than internal, because the write finishes *after* the score appears
	 * — `finish()` is fired off when the last answer lands, and the summary renders
	 * immediately. A reader who tapped Finish and left at once could outrun it, and nothing
	 * on screen would have said the sitting was still in flight. Now it does, and the
	 * end-to-end test waits on the same attribute instead of on a guess.
	 */
	let saveState = $state<'idle' | 'saving' | 'saved' | 'failed'>('idle');

	const areas = $derived(
		bank ? [...availableCategories(bank)].sort((a, b) => b[1] - a[1]) : []
	);
	const question = $derived(session[at] ?? null);
	const right = $derived(picked !== null && question !== null && picked === question.answer);
	const done = $derived(session.length > 0 && at >= session.length);
	const score = $derived(session.length - missed.length);

	/*
	 * `data-drill-status` is what the end-to-end tests wait on. The bank is a lazily
	 * imported chunk, so "the page rendered" and "the page can start" are different
	 * moments, and a test that assumes otherwise is a test that fails under load.
	 */
	const status = $derived(bank === null ? 'loading' : 'ready');

	$effect(() => {
		void loadPairDrills().then((b) => (bank = b));
	});

	/** Term name and one-line gloss, from the index every page already carries. */
	const nameOf = (id: string) => termIndex.find((t) => t.i === id)?.t ?? id;
	const glossOf = (id: string) => termIndex.find((t) => t.i === id)?.g ?? '';

	function start() {
		if (!bank) return;
		session = buildSession(bank, { categories: chosen, size: SIZE });
		at = 0;
		picked = null;
		missed = [];
		reinforced = 0;
		startedAt = Date.now();
		saveState = 'idle';
	}

	function toggle(c: TermCategory) {
		chosen = chosen.includes(c) ? chosen.filter((x) => x !== c) : [...chosen, c];
	}

	function answer(id: string) {
		if (picked !== null || question === null) return;
		picked = id;
		if (id !== question.answer) missed = [...missed, question];
		announcer.announce(
			id === question.answer ? 'Correct.' : `Not correct. This is ${nameOf(question.answer)}.`,
			'assertive'
		);
	}

	function next() {
		picked = null;
		at += 1;
		if (at >= session.length) void finish();
	}

	/**
	 * End of the sitting: keep it, then make what was missed due again.
	 *
	 * Recorded before the flashcard write rather than after. The scheduler write is the one
	 * that can take a while — it reads every card — and a reader who closes the page during
	 * it should still have the sitting in their history, which is the cheaper and more
	 * useful of the two.
	 */
	async function finish() {
		saveState = 'saving';
		const ok = await recordSitting({
			startedAt,
			questions: session,
			missed,
			categories: chosen
		});
		saveState = ok ? 'saved' : 'failed';
		await reinforce();
	}

	/**
	 * Make the terms behind a miss due again.
	 *
	 * Both terms of the pair, not only the right answer: a miss here does not say the
	 * reader failed to recall one definition, it says these two are not yet told apart,
	 * and the one they wrongly chose is half of that. Same machinery the quiz uses, so a
	 * reader who drills and a reader who tests end up with one deck rather than two.
	 */
	async function reinforce() {
		reinforced = await study.reinforce(missed.map(termsBehind));
	}
</script>

<svelte:head>
	<title>Commonly confused — ABA Assist</title>
	<meta
		name="description"
		content="Practice telling apart the pairs that get mixed up: negative reinforcement and punishment, DRO and DRA, forward and backward chaining. Built from the glossary's own examples."
	/>
</svelte:head>

<div data-drill-status={status}></div>

<h1>Commonly confused</h1>

{#if session.length === 0}
	<p class="lede">
		Most marks are lost on pairs, not on single terms. Each of these shows one situation and
		two names it could have; the examples come straight from the glossary entries, so
		everything here is something you can look up afterwards.
	</p>

	{#if bank === null}
		<p class="note" role="status">Loading the pairs…</p>
	{:else}
		<fieldset>
			<legend>Which areas</legend>
			<p class="hint">Leave everything unticked for a mix of all of them.</p>
			<ul class="areas">
				{#each areas as [category, count] (category)}
					<li>
						<label>
							<input
								type="checkbox"
								checked={chosen.includes(category)}
								onchange={() => toggle(category)}
							/>
							<span>
								<strong>{CATEGORY_LABELS[category]}</strong>
								<span class="blurb">{count} to draw from</span>
							</span>
						</label>
					</li>
				{/each}
			</ul>
		</fieldset>

		<button type="button" class="go" onclick={start} disabled={bank.length === 0}>
			Start
		</button>

		{#if bank.length === 0}
			<p class="note" role="note">
				No pairs are available in this build yet. They are generated from approved glossary
				entries, so they arrive as those do.
			</p>
		{/if}
	{/if}

	<p class="note" role="note">
		These are generated from the glossary rather than written as exam questions, and they are
		not from the certifying board. Each sitting is kept on this device — the score and which
		pairs you mixed up, so <a href={resolve('/progress')}
			>the ones that keep catching you out</a
		> can be named. A miss also makes both terms due again in your flashcards.
	</p>
{:else if done}
	<section class="card" aria-labelledby="{uid}-done" data-sitting={saveState}>
		<h2 id="{uid}-done" class="section-head">How that went</h2>
		<p class="score">{score} of {session.length}</p>
		{#if reinforced > 0}
			<p>
				{reinforced}
				{reinforced === 1 ? 'term is' : 'terms are'} now due in your
				<a href={resolve('/study')}>flashcards</a>.
			</p>
		{/if}

		{#if missed.length > 0}
			<h3 class="section-head">Worth another look</h3>
			<ul class="missed">
				{#each missed as q (q.id)}
					<li>
						<a href={resolve('/glossary/[slug]', { slug: q.answer })}>{nameOf(q.answer)}</a>
						<span class="vs">against</span>
						<a
							href={resolve('/glossary/[slug]', {
								slug: q.options.find((o) => o !== q.answer)!
							})}>{nameOf(q.options.find((o) => o !== q.answer)!)}</a
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if saveState === 'failed'}
		<p class="note" role="status">
			This sitting could not be saved — this device is not letting the app write stored data.
			The score above is still correct; it just will not be there later.
		</p>
	{/if}

	<p class="more">
		<a href={resolve('/progress')}>How it is going</a> — these sittings against the ones before them.
	</p>

	<button type="button" class="go" onclick={start}>Go again</button>
	<button type="button" class="stop" onclick={() => (session = [])}>Change areas</button>
{:else if question}
	<p class="progress" role="status">{at + 1} of {session.length}</p>

	<section class="card" aria-labelledby="{uid}-q">
		<h2 id="{uid}-q" class="prompt">{question.prompt}</h2>

		<!--
			Two buttons rather than radios and a submit: the answer *is* the submission, and
			an extra confirming tap is a tap too many for something done standing up. Both
			stay on screen afterwards so the reader can see what they chose against what was
			right, which is the whole lesson of a discrimination item.
		-->
		<ul class="options">
			{#each question.options as option (option)}
				<li>
					<button
						type="button"
						class="option"
						disabled={picked !== null}
						aria-pressed={picked === option}
						data-state={picked === null
							? 'open'
							: option === question.answer
								? 'answer'
								: option === picked
									? 'wrong'
									: 'other'}
						onclick={() => answer(option)}
					>
						<strong>{nameOf(option)}</strong>
						{#if picked !== null}
							<span class="gloss">{glossOf(option)}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>

		{#if picked !== null}
			<!-- The verdict is a word before it is a colour, in both directions. -->
			<div class="verdict" data-verdict={right ? 'right' : 'wrong'}>
				<p class="said">
					{right ? 'Correct.' : `Not correct — this is ${nameOf(question.answer)}.`}
				</p>
				<p class="more">
					<a href={resolve('/glossary/[slug]', { slug: question.answer })}>
						Read {nameOf(question.answer)} in full
					</a>
				</p>
			</div>
			<button type="button" class="go" onclick={next}>
				{at + 1 === session.length ? 'Finish' : 'Next'}
			</button>
		{/if}
	</section>

	<button type="button" class="stop" onclick={() => (session = [])}>Stop</button>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
	}

	.lede {
		color: var(--text-muted);
		margin-top: 0;
	}

	fieldset {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.5rem;
		margin: 1rem 0;
	}

	legend {
		font-weight: 600;
		padding: 0 0.3rem;
	}

	.hint {
		margin: 0.2rem 0.3rem 0.6rem;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.areas {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.areas label {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		padding: 0.5rem 0.3rem;
		min-height: var(--tap);
	}

	.areas .blurb {
		display: block;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.card {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
		margin: 1rem 0;
	}

	.prompt {
		font-size: 1.05rem;
		font-weight: 600;
		line-height: 1.5;
		margin: 0 0 1rem;
	}

	.progress {
		color: var(--text-muted);
		font-size: 0.9rem;
		margin: 0;
	}

	.options {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.6rem;
	}

	.option {
		display: block;
		width: 100%;
		min-height: var(--tap);
		text-align: left;
		padding: 0.7rem 0.9rem;
		border: 2px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}

	.option:disabled {
		cursor: default;
	}

	/*
	 * After the answer, the two options carry the outcome themselves — a left border
	 * weight and a word, never a fill. A filled option would read as loud as a page band,
	 * and the whole arrangement depends on a fill meaning "this is what kind of page this
	 * is" and nothing else.
	 */
	.option[data-state='answer'] {
		border-color: var(--yes);
		border-left-width: 6px;
	}

	.option[data-state='wrong'] {
		border-color: var(--stop-border);
		border-left-width: 6px;
	}

	.option[data-state='other'] {
		opacity: 0.7;
	}

	.option .gloss {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.verdict {
		margin-top: 1rem;
		padding-left: 0.75rem;
		border-left: 4px solid var(--stop-border);
	}

	.verdict[data-verdict='right'] {
		border-left-color: var(--yes);
	}

	.said {
		margin: 0;
		font-weight: 600;
	}

	.more {
		margin: 0.35rem 0 0;
		font-size: 0.9rem;
	}

	.score {
		font-size: 1.6rem;
		font-weight: 700;
		margin: 0.2rem 0 0.6rem;
	}

	.missed {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.missed li {
		padding: 0.4rem 0;
		border-top: 1px solid var(--hair);
	}

	.vs {
		color: var(--text-muted);
		font-size: 0.9rem;
		padding: 0 0.3rem;
	}

	.go,
	.stop {
		min-height: var(--tap);
		padding: 0 1.1rem;
		border-radius: var(--radius);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.go {
		background: var(--accent);
		color: var(--accent-text);
		border: 1px solid var(--accent);
	}

	.go:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.stop {
		background: transparent;
		color: var(--text);
		border: 1px solid var(--border);
		margin-left: 0.5rem;
	}

	.note {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.more {
		margin: 0.75rem 0;
		font-size: 0.9rem;
	}

	@media (forced-colors: active) {
		.option[data-state='answer'],
		.option[data-state='wrong'] {
			border-left-width: 6px;
		}

		.option[data-state='other'] {
			opacity: 1;
		}
	}
</style>
