<script lang="ts">
	import { resolve } from '$app/paths';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import {
		DRILL_KINDS,
		drillKind,
		isCorrect,
		makeDrill,
		parseAnswer,
		type Drill,
		type DrillKind
	} from '$lib/drills/calc.js';

	const uid = $props.id();

	/*
	 * Everything here is generated, so there is no bank to run out of and nothing to
	 * repeat. The trade is that a session is not stored: this page keeps a tally while you
	 * are on it and forgets it when you leave, which the page says rather than implies.
	 */
	let chosen = $state<DrillKind[]>(DRILL_KINDS.map((k) => k.id));
	let drill = $state<Drill | null>(null);
	let entry = $state('');
	let checked = $state(false);
	let right = $state(0);
	let asked = $state(0);

	const selected = $derived(DRILL_KINDS.filter((k) => chosen.includes(k.id)));
	const given = $derived(parseAnswer(entry));
	const correct = $derived(drill !== null && isCorrect(drill, given));
	const info = $derived(drill ? drillKind(drill.kind) : null);

	function toggle(id: DrillKind) {
		const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
		// Never leave nothing selected: there would be nothing to generate from.
		if (next.length > 0) chosen = next;
	}

	function next() {
		const pool = selected.length > 0 ? selected : DRILL_KINDS;
		drill = makeDrill(pool[Math.floor(Math.random() * pool.length)].id);
		entry = '';
		checked = false;
	}

	function check() {
		if (drill === null || Number.isNaN(given) || checked) return;
		checked = true;
		asked += 1;
		if (correct) right += 1;
		announcer.announce(
			correct ? 'Correct' : `Not correct. The answer is ${drill.answer} ${drill.unit}.`,
			'assertive'
		);
	}
</script>

<svelte:head>
	<title>Calculation drills — ABA Assist</title>
	<meta
		name="description"
		content="Practice working out rate, percentage, mean duration and the four interobserver agreement methods, on fresh numbers every time, with the working shown."
	/>
</svelte:head>

<h1>Calculation drills</h1>

{#if drill === null}
	<p class="lede">
		The exam asks you to work figures out, not only to recognize them. These problems are
		generated, so they do not run out and you never get the same one twice. Every answer comes
		with the working.
	</p>

	<fieldset>
		<legend>What to practice</legend>
		<ul class="kinds">
			{#each DRILL_KINDS as k (k.id)}
				<li>
					<label>
						<input
							type="checkbox"
							checked={chosen.includes(k.id)}
							onchange={() => toggle(k.id)}
						/>
						<span>
							<strong>{k.label}</strong>
							<span class="blurb">{k.blurb}</span>
						</span>
					</label>
				</li>
			{/each}
		</ul>
	</fieldset>

	<button type="button" class="go" onclick={next}>Start</button>

	<p class="sibling">
		Mixing up two terms rather than the arithmetic? Try
		<a href={resolve('/drills/pairs')}>commonly confused</a>. Want the other half of the
		measurement domain — catching the behavior rather than working out the number afterwards?
		<a href={resolve('/drills/data')}>Take data on a session</a>.
	</p>

	<p class="note" role="note">
		This is arithmetic practice, not exam questions. It is not written by the certifying board
		and it is not a prediction of anything. Nothing is saved — the tally is on screen only, and
		it goes when you leave.
	</p>
{:else}
	<p class="progress" role="status">{right} of {asked} correct</p>

	<section class="card" aria-labelledby="{uid}-q">
		<h2 id="{uid}-q">{drill.question}</h2>

		<dl class="given">
			{#each drill.given as g (g.label)}
				<dt>{g.label}</dt>
				<dd>{g.value}</dd>
			{/each}
		</dl>

		<div class="answer">
			<label for="{uid}-entry"
				>Your answer{drill.unit === '%' ? ' (%)' : ` (${drill.unit})`}</label
			>
			<input
				id="{uid}-entry"
				type="text"
				inputmode="decimal"
				autocomplete="off"
				bind:value={entry}
				readonly={checked}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						if (checked) next();
						else check();
					}
				}}
			/>
		</div>

		{#if !checked}
			<button type="button" class="go" disabled={Number.isNaN(given)} onclick={check}>
				Check
			</button>
		{:else}
			<div class="verdict" class:right={correct} data-verdict={correct ? 'right' : 'wrong'}>
				<!-- Never colour alone: the verdict is a word before it is a shade. -->
				<p class="said">
					{correct ? 'Correct.' : 'Not correct.'}
					{#if !correct}
						The answer is {drill.answer}{drill.unit === '%' ? '%' : ` ${drill.unit}`}.
					{/if}
				</p>
				<ol class="working">
					{#each drill.working as line (line)}
						<li>{line}</li>
					{/each}
				</ol>
				{#if info}
					<p class="more">
						<a href={resolve('/glossary/[slug]', { slug: info.termId })}>{info.label}</a> —
						{info.blurb}
					</p>
				{/if}
			</div>
			<button type="button" class="go" onclick={next}>Next</button>
		{/if}
	</section>

	<button type="button" class="stop" onclick={() => (drill = null)}>Stop</button>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
	}

	.lede {
		color: var(--text-muted);
		margin-top: 0;
	}

	.sibling {
		font-size: 0.9rem;
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

	.kinds {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.kinds label {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		padding: 0.5rem 0.25rem;
		min-height: var(--tap);
	}

	.kinds input {
		width: 1.15rem;
		height: 1.15rem;
		flex: 0 0 auto;
		margin-top: 0.15rem;
	}

	.blurb {
		display: block;
		font-size: 0.85rem;
		color: var(--text-muted);
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

	.progress {
		color: var(--text-muted);
		margin: 0 0 0.5rem;
		font-variant-numeric: tabular-nums;
	}

	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem;
	}

	.card h2 {
		font-size: 1.05rem;
		margin: 0 0 0.75rem;
	}

	.given {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.2rem 0.75rem;
		margin: 0 0 1rem;
		padding: 0.5rem 0.6rem;
		background: var(--surface);
		border-radius: var(--radius);
	}

	.given dt {
		color: var(--text-muted);
	}

	.given dd {
		margin: 0;
		font-weight: 700;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.answer {
		margin-bottom: 0.75rem;
	}

	.answer label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.answer input {
		width: 100%;
		min-height: var(--tap);
		padding: 0.5rem 0.7rem;
		font-size: 1.25rem;
		font-variant-numeric: tabular-nums;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
	}

	.verdict {
		border: 1px solid var(--stop-border, var(--border));
		border-left-width: 4px;
		border-radius: var(--radius);
		padding: 0.6rem 0.75rem;
		margin-bottom: 0.75rem;
	}

	.verdict.right {
		border-color: var(--go-border, var(--border));
	}

	.said {
		margin: 0 0 0.5rem;
		font-weight: 700;
	}

	.working {
		margin: 0;
		padding-left: 1.1rem;
	}

	.working li + li {
		margin-top: 0.3rem;
	}

	.more {
		margin: 0.6rem 0 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.note {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-top: 1rem;
	}
</style>
