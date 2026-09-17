<script lang="ts">
	import { resolve } from '$app/paths';
	import PlotCanvas from '$lib/components/PlotCanvas.svelte';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { recordPlot } from '$lib/state/drills.js';
	import {
		boundaryChoices,
		emptyAnswer,
		makeTask,
		scorePlot,
		type PlotAnswer,
		type PlotScore,
		type PlotTask
	} from '$lib/drills/plot.js';

	const uid = $props.id();

	let task = $state<PlotTask>(makeTask(`plot-${Date.now()}`));
	let answer = $state<PlotAnswer>(emptyAnswer());
	let selected = $state<number>(1);
	let result = $state<PlotScore | null>(null);
	let startedAt = $state(Date.now());
	let saveState = $state<'idle' | 'saving' | 'saved' | 'failed'>('idle');

	const done = $derived(result !== null);
	const placed = $derived(answer.points[selected]);
	const truth = $derived<PlotAnswer>({
		points: Object.fromEntries(
			task.sessions.filter((s) => s.y !== null).map((s) => [s.x, s.y as number])
		),
		boundary: task.boundary
	});

	/** Every decision the reader has made, which is what "have you finished" means here. */
	const decided = $derived(
		Object.keys(answer.points).length + (answer.boundary === null ? 0 : 1)
	);

	function set(x: number, y: number) {
		if (done) return;
		selected = x;
		answer = { ...answer, points: { ...answer.points, [x]: y } };
	}

	function nudge(by: number) {
		if (done) return;
		const from = answer.points[selected];
		// An unplotted column starts in the middle rather than at zero: a reader nudging up
		// from the floor to reach eight is being made to press a button eight times.
		const next = Math.max(0, Math.min(task.yMax, (from ?? Math.round(task.yMax / 2)) + by));
		set(selected, next);
		announcer.announce(`Session ${selected}, ${next}`);
	}

	function clear() {
		if (done) return;
		const rest = { ...answer.points };
		delete rest[selected];
		answer = { ...answer, points: rest };
		announcer.announce(`Session ${selected} left blank`);
	}

	function setBoundary(at: number) {
		if (done) return;
		answer = { ...answer, boundary: answer.boundary === at ? null : at };
	}

	async function check() {
		if (done) return;
		const scored = scorePlot(task, answer);
		result = scored;
		announcer.announce(
			`${scored.score} of ${scored.opportunities} right, ${scored.percent} per cent.`,
			'assertive'
		);
		saveState = 'saving';
		const ok = await recordPlot({
			startedAt,
			opportunities: scored.opportunities,
			score: scored.score
		});
		saveState = ok ? 'saved' : 'failed';
	}

	function next() {
		task = makeTask(`plot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
		answer = emptyAnswer();
		selected = 1;
		result = null;
		saveState = 'idle';
		startedAt = Date.now();
	}

	function onKey(e: KeyboardEvent) {
		if (done) return;
		const target = e.target as HTMLElement | null;
		if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			nudge(1);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			nudge(-1);
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			selected = Math.max(1, selected - 1);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			selected = Math.min(task.sessions.length, selected + 1);
		}
	}

	const valueOf = (x: number) => {
		const v = answer.points[x];
		return v === undefined ? 'blank' : String(v);
	};
</script>

<svelte:head>
	<title>Drawing a graph — ABA Assist</title>
	<meta
		name="description"
		content="Practice putting a data sheet on a graph: plot each session, leave the one nobody ran alone, and put the phase-change line in the right gap. Scored against the graph it should have been."
	/>
</svelte:head>

<svelte:window onkeydown={onKey} />

<div data-plot-status={done ? 'done' : 'drawing'}></div>

<h1>Drawing a graph</h1>

<p class="lede">
	The reading pages show you a finished graph. This is the other half: the data sheet comes
	back and somebody has to put it on paper. Plot each session, leave alone the one nobody ran,
	and put the phase-change line in the right gap.
</p>

<section aria-labelledby="{uid}-sheet">
	<h2 id="{uid}-sheet" class="section-head">{task.behavior} — the data sheet</h2>
	<!--
		A row per session, not a column per session. Eight columns plus two row headers is
		476px, which at 320px is either a sideways scroll or a scrollable region with no
		keyboard access — both of which the sweeps caught, and both of which are worse than
		the obvious answer. A data sheet with a row per session is also what most of them
		actually look like.
	-->
	<table>
		<caption class="visually-hidden">
			{task.behavior}, in {task.unit}, by session. A dash is a session that was not run.
		</caption>
		<thead>
			<tr>
				<th scope="col">Session</th>
				<th scope="col">{task.unit}</th>
				<th scope="col">Condition</th>
			</tr>
		</thead>
		<tbody>
			{#each task.sessions as s (s.x)}
				<tr class:on={selected === s.x}>
					<th scope="row">{s.x}</th>
					<td data-value={s.y ?? 'none'}>{s.y ?? '—'}</td>
					<td>{s.phase === 0 ? 'Baseline' : 'Intervention'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p class="hint">
		A dash is a session that was not run. It has no value, so it gets no point — and the line
		does not cross it.
	</p>
</section>

{#if !done}
	<section aria-labelledby="{uid}-draw">
		<h2 id="{uid}-draw" class="section-head">Your graph</h2>

		<PlotCanvas {task} {answer} {selected} onplace={set} label="working" />

		<!--
			The picture is tappable, but these are the controls. A reader on a phone can put a
			point roughly where it goes with a thumb and then correct it here; a reader on a
			keyboard never has to touch the picture at all, and neither route is the poor one.
		-->
		<h3 class="sub" id="{uid}-cols">Sessions</h3>
		<ul class="cols" aria-labelledby="{uid}-cols">
			{#each task.sessions as s (s.x)}
				<li>
					<button
						type="button"
						class="col"
						aria-pressed={selected === s.x}
						onclick={() => (selected = s.x)}
					>
						<span class="n">{s.x}</span>
						<span class="v" data-placed={answer.points[s.x] ?? 'none'}>{valueOf(s.x)}</span>
					</button>
				</li>
			{/each}
		</ul>

		<div class="stepper" role="group" aria-label="Value for session {selected}">
			<button type="button" onclick={() => nudge(1)} aria-label="Up one">▲</button>
			<p class="reading" role="status">
				Session {selected}: <strong>{valueOf(selected)}</strong>
			</p>
			<button type="button" onclick={() => nudge(-1)} aria-label="Down one">▼</button>
			<button type="button" class="clear" onclick={clear} disabled={placed === undefined}>
				Leave blank
			</button>
		</div>
		<p class="hint">
			Arrow keys work too: left and right pick the session, up and down set it.
		</p>

		<h3 class="sub" id="{uid}-line">Phase-change line</h3>
		<p class="hint">
			It goes between two sessions, never through one — the last of one condition and the first
			of the next.
		</p>
		<ul class="gaps" aria-labelledby="{uid}-line">
			{#each boundaryChoices(task) as gap (gap)}
				<li>
					<button
						type="button"
						aria-pressed={answer.boundary === gap}
						onclick={() => setBoundary(gap)}
					>
						{Math.floor(gap)}<span aria-hidden="true">|</span><span class="visually-hidden"
							>and</span
						>{Math.ceil(gap)}
					</button>
				</li>
			{/each}
		</ul>

		<button type="button" class="primary check" onclick={() => void check()}>
			Check my graph
		</button>
		<p class="hint" role="status">
			{decided} of {task.sessions.length + 1} decisions made. A session you mean to leave blank counts
			as one.
		</p>
	</section>
{:else if result !== null}
	<section class="result" data-sitting={saveState} aria-labelledby="{uid}-result">
		<h2 id="{uid}-result" class="section-head">
			{result.score} of {result.opportunities} right
		</h2>
		<p class="figure" data-percent={result.percent}>{result.percent}%</p>

		<div class="pair">
			<figure>
				<figcaption>What you drew</figcaption>
				<PlotCanvas {task} {answer} label="yours" />
			</figure>
			<figure>
				<figcaption>What it should have been</figcaption>
				<PlotCanvas {task} answer={truth} label="truth" />
			</figure>
		</div>

		<ul class="faults">
			{#if result.wrong.length > 0}
				{#each result.wrong as w (w.x)}
					<li data-fault="value">
						Session {w.x} is plotted at {w.placed}; the sheet says {w.truth}.
					</li>
				{/each}
			{/if}
			{#each result.missing as x (x)}
				<li data-fault="missing">
					Session {x} had a value on the sheet and is not on the graph.
				</li>
			{/each}
			{#each result.invented as x (x)}
				<li data-fault="invented">
					Session {x} was not run, and there is a point on it. On a real graph that is a data point
					in a client's record that nobody collected.
				</li>
			{/each}
			{#if !result.boundaryCorrect}
				<li data-fault="boundary">
					The phase-change line belongs between sessions {Math.floor(task.boundary)} and
					{Math.ceil(task.boundary)} — after the last baseline session, before the first intervention
					one. Look at what yours did to the shape of the path.
				</li>
			{/if}
			{#if result.score === result.opportunities}
				<li data-fault="none">
					Every point, the blank, and the line. That is the graph a supervisor can read without
					asking you anything.
				</li>
			{/if}
		</ul>

		{#if saveState === 'failed'}
			<p class="note" role="status">
				This sitting could not be saved — storage is blocked or full. The marking above is
				still right.
			</p>
		{/if}

		<button type="button" class="primary" onclick={next}>Another data sheet</button>
	</section>
{/if}

<p class="crumbs">
	<a href={resolve('/graphs')}>Reading graphs</a> ·
	<a href={resolve('/drills/data')}>Taking data</a> ·
	<a href={resolve('/drills')}>Calculation drills</a>
</p>

<p class="note" role="note">
	The data is invented, like every graph in this app. Nothing here is a real person's record.
</p>

<style>
	.lede {
		color: var(--text-muted);
		max-width: 62ch;
	}

	table {
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
		max-width: 26rem;
		width: 100%;
	}

	th,
	td {
		border: 1px solid var(--hair);
		padding: 0.3rem 0.5rem;
		text-align: left;
	}

	thead th {
		color: var(--text-muted);
		font-size: 0.9em;
	}

	th[scope='row'] {
		width: 4.5rem;
		font-weight: 600;
	}

	/* The selected session is marked in the sheet too, so the two never drift apart. */
	tr.on th,
	tr.on td {
		background: var(--surface);
		border-color: var(--accent);
	}

	td[data-value='none'] {
		color: var(--text-muted);
	}

	.hint {
		color: var(--text-muted);
		font-size: 0.92em;
		max-width: 62ch;
	}

	.sub {
		font-size: 1.05rem;
		margin: 1.25rem 0 0.35rem;
	}

	.cols,
	.gaps {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0.35rem 0;
		padding: 0;
	}

	.cols button,
	.gaps button {
		display: grid;
		gap: 0.1rem;
		min-width: var(--tap);
		min-height: var(--tap);
		padding: 0.25rem 0.45rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}

	.cols button[aria-pressed='true'],
	.gaps button[aria-pressed='true'] {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-text);
	}

	.cols .n {
		font-size: 0.75em;
		opacity: 0.8;
	}

	.cols .v {
		font-weight: 700;
	}

	.cols .v[data-placed='none'] {
		font-weight: 400;
		font-size: 0.8em;
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin: 0.5rem 0;
	}

	.stepper button {
		min-width: 3.5rem;
		min-height: 3rem;
		font-size: 1.1rem;
		border-radius: var(--radius);
		border: 2px solid var(--accent);
		background: var(--surface-raised);
		color: var(--text);
	}

	.stepper .clear {
		min-width: auto;
		padding: 0 0.75rem;
		font-size: 1rem;
	}

	.stepper button:disabled {
		border-color: var(--border);
		color: var(--text-muted);
	}

	.reading {
		margin: 0;
		min-width: 10rem;
	}

	.check {
		min-height: var(--tap);
		margin-top: 1rem;
	}

	.figure {
		font-size: 2rem;
		font-weight: 700;
		margin: 0.15rem 0 0.75rem;
		font-variant-numeric: tabular-nums;
	}

	.pair {
		display: grid;
		gap: 1rem;
	}

	@media (min-width: 46rem) {
		.pair {
			grid-template-columns: 1fr 1fr;
		}
	}

	.pair figure {
		margin: 0;
	}

	.pair figcaption {
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.faults {
		margin: 1rem 0;
		padding-left: 1.1rem;
		max-width: 62ch;
	}

	.faults li {
		margin-bottom: 0.35rem;
	}

	.faults li[data-fault='none'] {
		list-style: none;
		margin-left: -1.1rem;
	}

	.crumbs {
		margin-top: 2rem;
		color: var(--text-muted);
		font-size: 0.92em;
	}
</style>
