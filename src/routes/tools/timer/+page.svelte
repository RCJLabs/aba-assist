<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { intervalTimer as t } from '$lib/state/timer.svelte.js';
	import {
		clock,
		INTERVAL_CHOICES,
		LENGTH_CHOICES,
		METHODS,
		methodInfo,
		type Method
	} from '$lib/tools/interval.js';

	const uid = $props.id();

	onMount(() => {
		t.load();
		const onVisible = () => {
			// Coming back from a locked phone: catch up to the clock rather than replaying
			// every cue that was missed.
			if (document.visibilityState === 'visible') t.resync();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			t.reset();
		};
	});

	const info = $derived(methodInfo(t.method));
	const pos = $derived(t.position);
	const summary = $derived(t.tally);
	const current = $derived(t.marks[pos.index] ?? null);

	async function start() {
		await t.start();
		announcer.announce(
			`Started. ${t.plan.intervals} intervals of ${t.intervalSeconds} seconds.`
		);
	}

	function stop() {
		t.finish();
		announcer.announce('Stopped.', 'assertive');
	}
</script>

<svelte:head>
	<title>Interval timer — ABA Assist</title>
	<meta
		name="description"
		content="A repeating timer for partial interval, whole interval and momentary time sampling, with a running percentage of intervals."
	/>
</svelte:head>

<nav aria-label="Breadcrumb" class="crumbs"><a href={resolve('/tools')}>Tools</a></nav>

<h1>Interval timer</h1>

<div data-timer-status={t.status} hidden></div>

{#if t.status === 'idle'}
	<p class="lede">
		A repeating cue for interval recording. It vibrates at the end of each interval so you can
		keep your eyes on the learner rather than on a clock.
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
					onchange={() => {
						t.method = m.id as Method;
						t.savePrefs();
					}}
				/>
				<span>
					<strong>{m.label}</strong>
					<span class="prompt">{m.scoreIf}</span>
				</span>
			</label>
		{/each}
	</fieldset>

	<p class="bias" role="note">
		<strong>Worth knowing before you report it:</strong>
		{info.bias}
		<a href={resolve('/glossary/[slug]', { slug: info.termId })}>Read the full entry</a>.
	</p>

	<div class="grid">
		<div class="field">
			<label for="{uid}-interval">Interval length</label>
			<select
				id="{uid}-interval"
				value={String(t.intervalSeconds)}
				onchange={(e) => {
					t.intervalSeconds = Number(e.currentTarget.value);
					t.savePrefs();
				}}
			>
				{#each INTERVAL_CHOICES as s (s)}
					<option value={String(s)}>{s} seconds</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="{uid}-length">Observation length</label>
			<select
				id="{uid}-length"
				value={String(t.totalMinutes)}
				onchange={(e) => {
					t.totalMinutes = Number(e.currentTarget.value);
					t.savePrefs();
				}}
			>
				{#each LENGTH_CHOICES as m (m)}
					<option value={String(m)}>{m} {m === 1 ? 'minute' : 'minutes'}</option>
				{/each}
			</select>
		</div>
	</div>

	<p class="count">
		{t.plan.intervals} intervals of {t.intervalSeconds} seconds.
	</p>

	<fieldset class="cues">
		<legend>Cues</legend>
		<label class="switch">
			<input
				type="checkbox"
				checked={t.vibrate}
				onchange={(e) => {
					t.vibrate = e.currentTarget.checked;
					t.savePrefs();
				}}
			/>
			<span>Vibrate</span>
		</label>
		<label class="switch">
			<input
				type="checkbox"
				checked={t.sound}
				onchange={(e) => {
					t.sound = e.currentTarget.checked;
					t.savePrefs();
				}}
			/>
			<span>Sound</span>
		</label>
		<p class="hint">
			Sound is off by default. A beep is audible to everybody in the room, including the
			learner, and it is a change to the environment that nobody's plan asked for.
		</p>
	</fieldset>

	<button type="button" class="primary big" onclick={start}>Start</button>

	<p class="note">
		This is a timer, not a data sheet. Nothing you tap here is saved — copy the totals onto
		whatever form your organization uses before you leave the page.
	</p>
{:else}
	<section class="run" aria-labelledby="run-heading">
		<h2 id="run-heading" class="visually-hidden">Recording</h2>

		<!--
			`role="timer"` with live updates off: the countdown changes five times a second
			and must never be read aloud. The cue is the vibration; the numbers are for eyes.
		-->
		<div class="face" data-cue={t.cueCount % 2} role="timer" aria-live="off">
			<span class="remaining">{clock(pos.remainingMs)}</span>
			<span class="of">
				Interval {pos.index + 1} of {t.plan.intervals}
			</span>
		</div>

		<p class="question">{info.prompt}</p>

		{#if t.status === 'running'}
			<div class="score">
				<button
					type="button"
					class="yes"
					aria-pressed={current === true}
					onclick={() => t.scoreCurrent(true)}
				>
					Yes
				</button>
				<button
					type="button"
					class="no"
					aria-pressed={current === false}
					onclick={() => t.scoreCurrent(false)}
				>
					No
				</button>
			</div>
		{/if}

		<dl class="totals">
			<div>
				<dt>Scored</dt>
				<dd>{summary.scored} / {t.plan.intervals}</dd>
			</div>
			<div>
				<dt>Occurred</dt>
				<dd>{summary.occurred}</dd>
			</div>
			<div>
				<dt>Percent of intervals</dt>
				<dd>{summary.percent === null ? '—' : `${summary.percent}%`}</dd>
			</div>
		</dl>

		{#if t.status === 'finished'}
			<p class="done" role="status">
				Finished. {summary.percent === null
					? 'Nothing was scored.'
					: `${summary.percent}% of the ${summary.scored} intervals you scored.`}
				Copy it onto your data sheet — this page keeps nothing.
			</p>
		{/if}

		<!--
			Every interval, tappable. Missing one is the normal case in a real session, and a
			timer that only lets you score the interval you are in makes that unrecoverable.
		-->
		<div class="strip">
			{#each t.marks as mark, i (i)}
				<button
					type="button"
					class="cell"
					data-mark={mark === null ? 'none' : mark ? 'yes' : 'no'}
					aria-current={i === pos.index && t.status === 'running' ? 'true' : undefined}
					onclick={() => t.cycle(i)}
				>
					<span class="visually-hidden">
						Interval {i + 1}, {mark === null
							? 'not scored'
							: mark
								? 'occurred'
								: 'did not occur'}
					</span>
					<span aria-hidden="true">{mark === null ? '·' : mark ? '✓' : '✗'}</span>
				</button>
			{/each}
		</div>

		<div class="actions">
			{#if t.status === 'running'}
				<button type="button" onclick={stop}>Stop</button>
			{/if}
			<button type="button" onclick={() => t.reset()}>
				{t.status === 'finished' ? 'New observation' : 'Discard'}
			</button>
		</div>

		{#if !t.wakeLockHeld}
			<p class="hint">
				This browser would not keep the screen awake, so it may sleep mid-observation.
			</p>
		{/if}
	</section>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
	}
	.crumbs {
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
	}
	.lede,
	.hint,
	.note,
	.count,
	.prompt {
		color: var(--text-muted);
		font-size: 0.95rem;
	}
	fieldset {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
		margin: 0 0 1rem;
	}
	legend {
		font-weight: 600;
		font-size: 0.9rem;
		padding: 0 0.35rem;
	}
	.method {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		min-height: var(--tap);
		padding: 0.4rem 0;
		cursor: pointer;
	}
	.method strong {
		display: block;
	}
	.bias {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.6rem 0.8rem;
		font-size: 0.95rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.75rem;
	}
	.field {
		display: grid;
		gap: 0.25rem;
	}
	label {
		font-weight: 600;
		font-size: 0.9rem;
	}
	.switch {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		min-height: var(--tap);
		font-weight: 400;
	}
	.big {
		width: 100%;
		min-height: 3.5rem;
		font-size: 1.15rem;
	}

	.face {
		display: grid;
		justify-items: center;
		gap: 0.25rem;
		border: 2px solid var(--border);
		border-radius: var(--radius);
		padding: 1.25rem 1rem;
		background: var(--surface-raised);
	}
	/*
	 * The visual cue: the face alternates on each boundary. A state change rather than an
	 * animation, so `prefers-reduced-motion` has nothing to suppress, and at one change
	 * per interval — five seconds at the very fastest — it is nowhere near a rate that
	 * could trouble anybody photosensitive.
	 */
	.face[data-cue='1'] {
		border-color: var(--accent);
		background: var(--surface);
	}
	.remaining {
		font-size: 3.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	.of {
		color: var(--text-muted);
	}
	.question {
		text-align: center;
		font-weight: 600;
		margin: 0.75rem 0;
	}
	.score {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.score button {
		min-height: 4rem;
		font-size: 1.2rem;
		font-weight: 700;
	}
	/* Never colour alone: each button is also labelled, and pressed state is aria-pressed. */
	.score .yes[aria-pressed='true'] {
		background: var(--accent);
		color: var(--accent-text);
	}
	.score .no[aria-pressed='true'] {
		background: var(--text-muted);
		color: var(--bg);
	}
	.totals {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin: 1rem 0;
	}
	.totals dt {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.totals dd {
		margin: 0;
		font-size: 1.35rem;
		font-weight: 700;
	}
	.strip {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin: 0.75rem 0;
	}
	.cell {
		min-width: var(--tap);
		min-height: var(--tap);
		font-size: 1rem;
		padding: 0;
	}
	.cell[data-mark='yes'] {
		background: var(--accent);
		color: var(--accent-text);
	}
	.cell[data-mark='no'] {
		background: var(--surface);
		color: var(--text-muted);
	}
	.cell[aria-current='true'] {
		outline: 3px solid var(--focus);
		outline-offset: 1px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.done {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.6rem 0.8rem;
		font-weight: 600;
	}
	.note {
		border-top: 1px solid var(--border);
		padding-top: 0.75rem;
		margin-top: 1rem;
	}
</style>
