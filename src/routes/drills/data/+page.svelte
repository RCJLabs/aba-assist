<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { Cue } from '$lib/cue.js';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { recordObservation } from '$lib/state/drills.js';
	import {
		INTERVALS,
		LENGTHS,
		METHODS,
		clip,
		clipRecord,
		intervalCount,
		makeStream,
		methodInfo,
		score,
		type Episode,
		type Method,
		type Scored,
		type Stream
	} from '$lib/drills/observe.js';

	const uid = $props.id();

	/*
	 * Pace.
	 *
	 * Half speed is an accommodation, not an easy mode. WCAG 2.2.1 exempts a time limit
	 * that is essential to the activity, and this one is — you cannot rehearse real-time
	 * data collection without real time — but "exempt" is a reason not to remove the limit,
	 * never a reason not to make it adjustable. Anybody whose hands or whose assistive
	 * technology need longer takes it here, and the recording task is unchanged.
	 */
	const PACES = [
		{ value: 0.5, label: 'Half speed' },
		{ value: 1, label: 'Real time' },
		{ value: 2, label: 'Double speed' },
		{ value: 4, label: 'Four times' }
	];

	let method = $state<Method>('frequency');
	let seconds = $state<number>(LENGTHS[1]);
	let intervalSeconds = $state<number>(INTERVALS[1]);
	let pace = $state(1);
	let sound = $state(true);

	let phase = $state<'setup' | 'running' | 'done'>('setup');
	let stream = $state<Stream | null>(null);
	let elapsed = $state(0);

	/** The reader's record, in three shapes because the methods record three ways. */
	let taps = $state<number[]>([]);
	let spans = $state<Episode[]>([]);
	let marks = $state<boolean[]>([]);
	/** The control's current position. Sampled at each interval boundary. */
	let latch = $state(false);
	/** A duration span in progress, or null. */
	let openedAt = $state<number | null>(null);

	let startedAt = $state(0);
	let result = $state<Scored | null>(null);
	let reuseSeed = $state<string | null>(null);
	let saveState = $state<'idle' | 'saving' | 'saved' | 'failed'>('idle');

	const cue = new Cue();
	let wakeLock: WakeLockSentinel | null = null;

	const info = $derived(methodInfo(method));
	const happening = $derived(
		stream !== null && stream.episodes.some((e) => e.start <= elapsed && elapsed < e.end)
	);
	const total = $derived(stream ? intervalCount(stream) : 0);
	const atInterval = $derived(Math.min(marks.length, Math.max(0, total - 1)));
	const untilCue = $derived(
		stream ? Math.max(0, (marks.length + 1) * stream.intervalSeconds - elapsed) : 0
	);
	const tally = $derived(
		method === 'frequency'
			? String(taps.length)
			: method === 'duration'
				? `${spansTotal().toFixed(0)}s`
				: `${marks.filter(Boolean).length} of ${marks.length}`
	);

	/*
	 * `data-observe-status` is what the end-to-end tests wait on, the same hook the pair
	 * drills use. A run is the only thing on this page with a duration, so "the page
	 * rendered" and "the page is recording" have to be separable.
	 */

	function spansTotal(): number {
		const open = openedAt === null ? 0 : elapsed - openedAt;
		return spans.reduce((sum, e) => sum + (e.end - e.start), 0) + open;
	}

	/**
	 * The clock.
	 *
	 * A start timestamp plus arithmetic, never a counter that gets decremented — a phone
	 * throttles timers in a background tab and a decremented counter drifts silently, which
	 * on a page about measurement would be a particularly poor joke.
	 *
	 * `elapsed` is read untracked on purpose: reading it normally would make this effect
	 * depend on the value it sets ten times a second.
	 */
	$effect(() => {
		if (phase !== 'running') return;
		const wall = Date.now();
		const from = untrack(() => elapsed);
		const speed = untrack(() => pace);
		const id = setInterval(() => tick(from + ((Date.now() - wall) / 1000) * speed), 100);
		return () => clearInterval(id);
	});

	/** Release the wake lock whatever ends the run, including navigating away mid-session. */
	$effect(() => () => void releaseWake());

	function tick(now: number) {
		const s = stream;
		if (s === null || phase !== 'running') return;
		const capped = Math.min(now, s.seconds);

		if (!info.continuous) {
			// Commit every boundary the tick crossed. A throttled tab can cross several.
			while (marks.length < Math.floor(capped / s.intervalSeconds) && marks.length < total) {
				marks = [...marks, latch];
				latch = false;
				cue.fire({ vibrate: true, sound });
			}
		}

		elapsed = capped;
		if (now >= s.seconds) void finish();
	}

	async function start(reuse = false) {
		const seed =
			reuse && reuseSeed !== null
				? reuseSeed
				: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		stream = makeStream(seed, { seconds, intervalSeconds });
		reuseSeed = seed;
		elapsed = 0;
		taps = [];
		spans = [];
		marks = [];
		latch = false;
		openedAt = null;
		result = null;
		saveState = 'idle';
		startedAt = Date.now();
		phase = 'running';

		// Both of these need the tap that got us here: iOS will not open an AudioContext
		// outside a gesture, and a wake lock is only granted to a page somebody touched.
		if (sound) cue.unlock();
		await acquireWake();
		announcer.announce(`Recording ${stream.behavior}. ${info.instruction}`, 'assertive');
	}

	function tap() {
		if (phase !== 'running') return;
		taps = [...taps, elapsed];
	}

	function toggle() {
		if (phase !== 'running') return;
		latch = !latch;
		if (method !== 'duration') return;
		if (latch) openedAt = elapsed;
		else if (openedAt !== null) {
			spans = [...spans, { start: openedAt, end: elapsed }];
			openedAt = null;
		}
	}

	async function finish() {
		const s = stream;
		if (s === null || phase !== 'running') return;
		phase = 'done';
		await releaseWake();

		// Close whatever the reader was still holding when the clock ran out.
		const closed =
			method === 'duration' && openedAt !== null
				? [...spans, { start: openedAt, end: elapsed }]
				: spans;
		openedAt = null;

		/*
		 * Scored against the session as far as it actually got. Stopping early is a reader
		 * choice, not a failure, and marking them wrong on intervals they were never shown
		 * would be the app inventing errors.
		 */
		const scoredStream = clip(s, elapsed);
		const scored = score(
			scoredStream,
			clipRecord({ method, taps, spans: closed, marks }, scoredStream)
		);
		result = scored;
		announcer.announce(
			`Run over. Agreement ${Math.round(scored.agreement)} per cent.`,
			'assertive'
		);

		saveState = 'saving';
		const ok = await recordObservation({
			startedAt,
			method,
			opportunities: scored.opportunities,
			agreement: scored.agreement
		});
		saveState = ok ? 'saved' : 'failed';
	}

	function again(sameSession: boolean) {
		if (!sameSession) reuseSeed = null;
		phase = 'setup';
		result = null;
	}

	async function acquireWake() {
		try {
			wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
		} catch {
			// Denied or unsupported. The run is a few minutes; a sleeping screen is a nuisance
			// rather than a broken feature, and there is nothing useful to say about it.
		}
	}

	async function releaseWake() {
		try {
			await wakeLock?.release();
		} catch {
			// Already gone.
		}
		wakeLock = null;
	}

	function onKey(e: KeyboardEvent) {
		if (phase !== 'running') return;
		const target = e.target as HTMLElement | null;
		if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
		if (e.key !== ' ' && e.key !== 'Enter') return;
		// The control is a button, so a focused one already handles this. Only take over the
		// key when focus is somewhere that would otherwise do nothing with it.
		if (target?.tagName === 'BUTTON') return;
		e.preventDefault();
		if (method === 'frequency') tap();
		else toggle();
	}

	const controlLabel = $derived(
		method === 'frequency'
			? 'Count it'
			: method === 'duration'
				? latch
					? 'Happening — tap when it stops'
					: 'Tap when it starts'
				: latch
					? 'Marked — tap to unmark'
					: 'Mark this interval'
	);

	const fmt = (n: number) => {
		const whole = Math.floor(n);
		return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
	};
	const pct = (n: number) => `${Math.round(n)}%`;
	const unitLabel = (u: Scored['unit']) =>
		u === 'count' ? 'occurrences' : u === 'seconds' ? 'seconds' : 'of intervals';
	const shown = (n: number, u: Scored['unit']) =>
		u === 'percent-of-intervals' ? `${Math.round(n)}%` : String(n);
</script>

<svelte:head>
	<title>Taking data — ABA Assist</title>
	<meta
		name="description"
		content="Practice recording behavior in real time: frequency, duration, partial and whole interval, momentary time sampling. Your data is scored against what actually happened, and the same session is reported every way at once."
	/>
</svelte:head>

<svelte:window onkeydown={onKey} />

<div data-observe-status={phase}></div>

<h1>Taking data</h1>

{#if phase === 'setup'}
	<p class="lede">
		The calculation drills give you a count and ask for a rate. This gives you a session.
		Behavior happens on screen, you record it the way the plan would have specified, and your
		data is checked against what actually occurred — including what every other method would
		have said about the same minutes.
	</p>

	{#if reuseSeed !== null}
		<p class="note" role="status">
			Same session as last time. Pick a different method and see what it makes of it.
		</p>
	{/if}

	<fieldset>
		<legend>What you are recording</legend>
		<ul class="methods">
			{#each METHODS as m (m.id)}
				<li class="method" class:on={method === m.id}>
					<!--
						The blurb is a description, not part of the name. Nested inside the label it
						became the radio's accessible name, so a screen reader announced the whole
						paragraph on every arrow key — and two options whose names both contained the
						words "whole interval" were no longer distinguishable, which is how this was
						found.
					-->
					<input
						id="{uid}-m-{m.id}"
						type="radio"
						name="{uid}-method"
						value={m.id}
						aria-describedby="{uid}-d-{m.id}"
						checked={method === m.id}
						onchange={() => (method = m.id)}
					/>
					<label class="name" for="{uid}-m-{m.id}">{m.label}</label>
					<span class="blurb" id="{uid}-d-{m.id}">{m.blurb}</span>
				</li>
			{/each}
		</ul>
	</fieldset>

	<div class="options">
		<div class="field">
			<label for="{uid}-length">Session length</label>
			<select id="{uid}-length" bind:value={seconds}>
				{#each LENGTHS as l (l)}
					<option value={l}>{l / 60} {l === 60 ? 'minute' : 'minutes'}</option>
				{/each}
			</select>
		</div>

		<div class="field">
			<label for="{uid}-interval">Interval</label>
			<select id="{uid}-interval" bind:value={intervalSeconds}>
				{#each INTERVALS as i (i)}
					<option value={i}>{i} seconds</option>
				{/each}
			</select>
		</div>

		<div class="field">
			<label for="{uid}-pace">Pace</label>
			<select id="{uid}-pace" bind:value={pace}>
				{#each PACES as p (p.value)}
					<option value={p.value}>{p.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<label class="check">
		<input type="checkbox" bind:checked={sound} />
		<span>Sound the interval cue</span>
	</label>

	<p class="hint">
		The interval setting shapes the session whichever method you pick, so the comparison at the
		end is about the same stretch of time either way.
	</p>

	<button type="button" class="primary" onclick={() => void start(reuseSeed !== null)}>
		Start
	</button>

	<p class="foot">
		This is a simulation, not a learner. Nothing here is a real person's data, and nothing
		about it leaves the device — only your agreement score is kept, so
		<a href={resolve('/progress')}>progress</a> can show whether you are getting better at catching
		behavior.
	</p>
{:else if phase === 'running' && stream !== null}
	<section class="run" aria-labelledby="{uid}-run">
		<h2 id="{uid}-run" class="section-head">{stream.behavior}</h2>
		<p class="instruction">{info.instruction}</p>

		<!--
			The stimulus. Never colour alone: the word is the information and the colour is the
			reinforcement of it, which is what makes this survive forced-colors mode and a
			reader who cannot tell the two backgrounds apart.

			`role="status"` announces each change, which is noisy and is also the point — for a
			screen-reader user this text *is* the behavior. Half speed exists partly for them.
		-->
		<div class="stage" data-happening={happening}>
			<p class="state" role="status">{happening ? 'Happening now' : 'Not happening'}</p>
		</div>

		<div class="clock">
			<span class="time">{fmt(elapsed)} <span class="of">of {fmt(stream.seconds)}</span></span>
			{#if !info.continuous}
				<span class="interval" data-interval={atInterval}>
					Interval {Math.min(marks.length + 1, total)} of {total} · cue in {Math.ceil(
						untilCue
					)}s
				</span>
			{/if}
			<span class="tally">Recorded: {tally}</span>
		</div>

		<div class="bar" aria-hidden="true">
			<div class="fill" style:width="{(elapsed / stream.seconds) * 100}%"></div>
		</div>

		{#if method === 'frequency'}
			<button type="button" class="record" onclick={tap}>{controlLabel}</button>
		{:else}
			<button type="button" class="record" aria-pressed={latch} onclick={toggle}>
				{controlLabel}
			</button>
		{/if}

		<button type="button" class="stop" onclick={() => void finish()}>Stop and score it</button>
	</section>
{:else if result !== null && stream !== null}
	<section class="result" data-sitting={saveState} aria-labelledby="{uid}-result">
		<h2 id="{uid}-result" class="section-head">What your data said</h2>

		<dl class="figures">
			<div>
				<dt>You recorded</dt>
				<dd class="figure">{shown(result.reported, result.unit)}</dd>
			</div>
			<div>
				<dt>It actually was</dt>
				<dd class="figure">{shown(result.truth, result.unit)}</dd>
			</div>
			<div>
				<dt>Agreement</dt>
				<dd class="figure" data-agreement={Math.round(result.agreement)}>
					{pct(result.agreement)}
				</dd>
			</div>
		</dl>
		<p class="hint">
			{#if result.unit === 'percent-of-intervals'}
				Agreement is worked out one interval at a time, not by comparing the two percentages —
				two observers can both report half the intervals and agree on none of them.
			{:else}
				Agreement here is the smaller total over the larger, over {result.opportunities}
				{unitLabel(result.unit)}.
			{/if}
		</p>

		{#if result.truthMarks.length > 0}
			<h3 class="sub">Interval by interval</h3>
			<ol class="strip">
				{#each result.truthMarks as truth, i (i)}
					<li
						class:agreed={result.marks[i] === truth}
						data-yours={result.marks[i] ? 'scored' : 'not'}
						data-truth={truth ? 'scored' : 'not'}
					>
						<span class="n">{i + 1}</span>
						<span class="yours">{result.marks[i] ? 'Y' : '·'}</span>
						<span class="truth">{truth ? 'Y' : '·'}</span>
					</li>
				{/each}
			</ol>
			<p class="key">
				Top row yours, bottom row what happened. <strong>Y</strong> scored, <strong>·</strong>
				not.
			</p>
		{/if}

		<h3 class="sub">The same session, reported five ways</h3>
		<p class="hint">
			This is the part worth staying for. One stretch of time, one behavior, and the number you
			would have written on the data sheet depends on which method the plan named.
		</p>
		<table class="compare">
			<thead>
				<tr><th scope="col">Method</th><th scope="col">Would report</th></tr>
			</thead>
			<tbody>
				<tr>
					<th scope="row">Frequency</th>
					<td>{stream.episodes.length} occurrences</td>
				</tr>
				{#each result.comparison as row (row.method)}
					<tr class:used={row.method === result.method}>
						<th scope="row">
							{methodInfo(row.method).label}
							{#if row.method === result.method}<span class="badge">yours</span>{/if}
						</th>
						<td>{pct(row.percent)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="hint">
			Partial interval can only read the same or higher than the behavior really occurred, and
			whole interval can only read the same or lower. That is arithmetic, not a tendency — and
			it is why the method a plan specifies is part of what the data means.
			<a href={resolve('/glossary/[slug]', { slug: info.termId })}>
				Read about {info.label.toLowerCase()}
			</a>.
		</p>

		{#if saveState === 'failed'}
			<p class="note" role="status">
				This sitting could not be saved — storage is blocked or full. The numbers above are
				still right.
			</p>
		{/if}

		<div class="after">
			<button type="button" class="primary" onclick={() => again(true)}>
				Same session, another method
			</button>
			<button type="button" onclick={() => again(false)}>A new session</button>
		</div>
	</section>
{/if}

<p class="crumbs">
	<a href={resolve('/drills')}>Calculation drills</a> ·
	<a href={resolve('/drills/pairs')}>Commonly confused</a> ·
	<a href={resolve('/tools/timer')}>Interval timer for a real session</a>
</p>

<style>
	.lede {
		color: var(--text-muted);
		max-width: 62ch;
	}

	.methods {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}

	li.method {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.15rem 0.6rem;
		align-items: start;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--hair);
		border-radius: var(--radius);
		background: var(--surface-raised);
	}

	li.method.on {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}

	li.method input {
		grid-row: 1 / span 2;
		align-self: center;
		min-width: 1.15rem;
		min-height: 1.15rem;
	}

	.name {
		font-weight: 600;
		/* The whole row is the target, not just the word. */
		display: flex;
		align-items: center;
		min-height: var(--tap);
		cursor: pointer;
	}

	.blurb {
		color: var(--text-muted);
		font-size: 0.9em;
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 1rem 0 0.5rem;
	}

	.field {
		display: grid;
		gap: 0.25rem;
		flex: 1 1 8rem;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: var(--tap);
	}

	.hint,
	.key,
	.foot {
		color: var(--text-muted);
		font-size: 0.92em;
		max-width: 62ch;
	}

	.instruction {
		font-weight: 600;
		margin: 0.25rem 0 0.75rem;
	}

	/*
		The stimulus. Two states that differ in text, in weight, and in background — a reader
		who can only perceive one of the three still has the information.
	*/
	.stage {
		display: grid;
		place-items: center;
		min-height: 8rem;
		border: 3px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}

	.stage[data-happening='true'] {
		border-color: var(--accent);
		background: var(--accent);
	}

	.state {
		margin: 0;
		font-size: 1.4rem;
		font-weight: 700;
	}

	.stage[data-happening='true'] .state {
		color: var(--accent-text);
	}

	.clock {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin: 0.6rem 0 0.35rem;
		font-variant-numeric: tabular-nums;
	}

	.time {
		font-weight: 700;
	}

	.of,
	.tally,
	.interval {
		color: var(--text-muted);
		font-weight: 400;
	}

	.bar {
		height: 6px;
		border-radius: 3px;
		background: var(--dial-track);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		background: var(--dial-fill);
	}

	/* Tapped repeatedly, under time pressure, one-handed. Far past the 44px floor. */
	.record {
		display: block;
		width: 100%;
		min-height: 6rem;
		margin: 0.75rem 0 0.5rem;
		font-size: 1.15rem;
		font-weight: 700;
		border-radius: var(--radius);
		border: 2px solid var(--accent);
		background: var(--surface-raised);
		color: var(--text);
	}

	.record[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}

	.stop {
		min-height: var(--tap);
	}

	.figures {
		display: flex;
		flex-wrap: wrap;
		gap: 1.25rem;
		margin: 0.5rem 0;
	}

	.figures div {
		display: grid;
		gap: 0.1rem;
	}

	.figures dt {
		color: var(--text-muted);
		font-size: 0.9em;
	}

	.figures dd {
		margin: 0;
	}

	.figure {
		font-size: 1.6rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.sub {
		font-size: 1.05rem;
		margin: 1.25rem 0 0.35rem;
	}

	.strip {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		margin: 0.35rem 0;
		padding: 0;
	}

	.strip li {
		display: grid;
		gap: 1px;
		justify-items: center;
		min-width: 1.6rem;
		padding: 0.15rem 0.1rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		font-variant-numeric: tabular-nums;
		font-size: 0.8em;
	}

	/* Disagreement is marked by a thick edge as well as by the two letters differing. */
	.strip li:not(.agreed) {
		border-width: 3px;
		border-color: var(--stop-border);
		background: var(--stop-bg);
		color: var(--stop-text);
	}

	.strip .n {
		color: var(--text-muted);
		font-size: 0.85em;
	}

	.compare {
		border-collapse: collapse;
		width: 100%;
		max-width: 32rem;
	}

	.compare th,
	.compare td {
		text-align: left;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--hair);
	}

	.compare td {
		font-variant-numeric: tabular-nums;
	}

	.compare tr.used {
		background: var(--surface);
	}

	.badge {
		display: inline-block;
		margin-left: 0.4rem;
		padding: 0 0.35rem;
		border: 1px solid var(--accent);
		border-radius: 4px;
		font-size: 0.75em;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.after {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}

	.after button {
		min-height: var(--tap);
	}

	.crumbs {
		margin-top: 2rem;
		color: var(--text-muted);
		font-size: 0.92em;
	}
</style>
