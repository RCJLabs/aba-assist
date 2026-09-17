<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import BarSeries from '$lib/components/BarSeries.svelte';
	import { progress, WINDOW_DAYS } from '$lib/state/progress.svelte.js';
	import { RETENTION_MINIMUM, TREND_MINIMUM } from '$lib/study/progress.js';

	onMount(() => {
		void progress.load();
	});

	const uid = $props.id();

	const dayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
	const shortDay = (iso: string) => dayFormat.format(new Date(`${iso}T00:00:00`));

	const trend = $derived(progress.trend);
	const days = $derived(progress.days);
	const recall = $derived(progress.recall);
	const run = $derived(progress.run);
	const deck = $derived(progress.deck);

	const peak = $derived(Math.max(1, ...days.map((d) => d.reviews)));
	const reviewsInWindow = $derived(days.reduce((n, d) => n + d.reviews, 0));

	const trendBars = $derived(
		trend.map((p, i) => ({
			label: `${i + 1}`,
			value: p.percent,
			detail: `${dayFormat.format(new Date(p.at))} · ${p.credential}${p.domain === 'all' ? '' : ` ${p.domain}`} · ${p.correct} of ${p.total}`
		}))
	);

	const dayBars = $derived(
		days.map((d) => ({ label: shortDay(d.day), value: d.reviews, detail: shortDay(d.day) }))
	);

	/*
	 * The accessible names. These carry the information the picture carries, in words —
	 * not a description of the shape. "A bar chart, mostly low" is not equivalent, and the
	 * coverage dial settled this question for the app already.
	 */
	const trendAlt = $derived(
		`Accuracy across ${trend.length} practice sittings, oldest first: ${trend.map((p) => `${p.percent}%`).join(', ')}.`
	);
	const daysAlt = $derived(
		`Flashcard reviews on each of the last ${WINDOW_DAYS} days: ${reviewsInWindow} in total across ${days.filter((d) => d.reviews > 0).length} days.`
	);
</script>

<svelte:head>
	<title>How it is going — ABA Assist</title>
	<meta
		name="description"
		content="Your practice accuracy over time and whether the flashcards are being remembered, worked out from what is already stored on this device."
	/>
</svelte:head>

<div data-progress-status={progress.status}></div>

<h1>How it is going</h1>

<p class="lede">
	Worked out from what this device has already recorded. Nothing new is stored to produce it
	and nothing is sent anywhere.
</p>

{#if progress.status === 'loading' || progress.status === 'idle'}
	<p class="note" role="status">Reading your history…</p>
{:else if progress.status === 'unavailable'}
	<p class="note" role="status">
		This device is not letting the app read its stored data — usually a private window or
		blocked site storage. Your history is not lost; it just cannot be read here.
	</p>
{:else if progress.empty}
	<section class="card">
		<h2 class="section-head">Nothing to show yet</h2>
		<p>
			This page fills in as you use the app. Answer some
			<a href={resolve('/quiz')}>practice questions</a>
			or review a few <a href={resolve('/study')}>flashcards</a> and come back.
		</p>
	</section>
{:else}
	<section aria-labelledby="{uid}-quiz">
		<h2 id="{uid}-quiz" class="section-head">Practice questions</h2>

		{#if trend.length === 0}
			<p class="note">
				No finished sittings yet. <a href={resolve('/quiz')}>Answer some questions</a> and this fills
				in.
			</p>
		{:else}
			<div class="card">
				<p class="figure">
					<strong>{trend.at(-1)!.percent}%</strong>
					<span class="unit">
						last sitting · {trend.at(-1)!.correct} of {trend.at(-1)!.total}
					</span>
				</p>

				{#if trend.length >= TREND_MINIMUM}
					<!--
						Halves rather than first-versus-last, and stated in points rather than as
						an arrow, because "up 6 points" can be checked against the numbers below
						and a green arrow cannot.
					-->
					<p class="shift" data-direction={(progress.shift ?? 0) >= 0 ? 'up' : 'down'}>
						{#if progress.shift === 0}
							Level: your recent sittings average the same as your earlier ones.
						{:else if (progress.shift ?? 0) > 0}
							Up {progress.shift} points — your recent half averages better than your earlier half.
						{:else}
							Down {Math.abs(progress.shift ?? 0)} points — your recent half averages worse than
							your earlier half.
						{/if}
					</p>

					<BarSeries
						bars={trendBars}
						max={100}
						alt={trendAlt}
						valueLabel="Score"
						unit="%"
						labelHeading="Sitting"
						scale="Each bar is one sitting, on a scale of 0 to 100%"
						axisStart={dayFormat.format(new Date(trend[0]!.at))}
						axisEnd={dayFormat.format(new Date(trend.at(-1)!.at))}
					/>
				{:else}
					<p class="hint">
						{TREND_MINIMUM - trend.length} more
						{TREND_MINIMUM - trend.length === 1 ? 'sitting' : 'sittings'} before this app will draw
						a trend. Two scores are not a direction.
					</p>
					<ol class="sittings">
						{#each [...trend].reverse() as p (p.id)}
							<li>
								<span class="when">{dayFormat.format(new Date(p.at))}</span>
								<span class="what"
									>{p.credential}{p.domain === 'all' ? '' : ` · ${p.domain}`}</span
								>
								<span class="score">{p.correct} of {p.total}</span>
							</li>
						{/each}
					</ol>
				{/if}

				<p class="more">
					<a href={resolve('/plan')}>Where you stand by area, and what to do about it</a>
				</p>
			</div>
		{/if}
	</section>

	<section aria-labelledby="{uid}-cards">
		<h2 id="{uid}-cards" class="section-head">Flashcards</h2>

		<div class="card">
			<p class="figure">
				{#if recall.percent === null}
					<strong>{recall.kept} of {recall.tested}</strong>
					<span class="unit">remembered so far</span>
				{:else}
					<strong>{recall.percent}%</strong>
					<span class="unit">remembered · {recall.kept} of {recall.tested}</span>
				{/if}
			</p>

			<p class="hint">
				{#if recall.percent === null}
					{recall.needed} more reviews of cards you have already learned before this app will put
					a percentage on it. Below about {RETENTION_MINIMUM} it is one bad morning, not a rate.
				{:else}
					Counted only on cards you had already learned — grading a new card "Again" on the way
					in is the scheduler working, not a memory failure. "Hard" counts as remembered.
				{/if}
			</p>

			{#if deck.total > 0}
				<dl class="split">
					<div>
						<dt>On an interval</dt>
						<dd>{deck.review}</dd>
					</div>
					<div>
						<dt>Being learned</dt>
						<dd>{deck.learning}</dd>
					</div>
					<div>
						<dt>Not started</dt>
						<dd>{deck.fresh}</dd>
					</div>
				</dl>
			{/if}
		</div>

		<div class="card">
			<h3 class="section-head">Last {WINDOW_DAYS} days</h3>
			<p class="figure">
				<strong>{reviewsInWindow}</strong>
				<span class="unit">
					reviews across {days.filter((d) => d.reviews > 0).length} days
				</span>
			</p>

			<BarSeries
				bars={dayBars}
				max={peak}
				alt={daysAlt}
				valueLabel="Reviews"
				labelHeading="Day"
				scale="One bar a day, on a scale of 0 to {peak} {peak === 1 ? 'review' : 'reviews'}"
			/>

			<p class="runs">
				<span
					>Current run: <strong>{run.current}</strong>
					{run.current === 1 ? 'day' : 'days'}</span
				>
				<span
					>Longest: <strong>{run.longest}</strong> {run.longest === 1 ? 'day' : 'days'}</span
				>
			</p>
			<p class="hint">
				A run is days in a row with at least one review. Spaced repetition only does anything
				if the deck is opened, so the gaps in the chart matter more than the heights.
			</p>
		</div>
	</section>

	<p class="note" role="note">
		These are figures about this app, not about an exam. A bank written by one author cannot
		tell you whether you would pass one, and nothing here is a prediction.
	</p>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
	}

	.lede {
		color: var(--text-muted);
		margin-top: 0;
	}

	.card {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
		margin: 0.75rem 0 1.25rem;
	}

	.figure {
		margin: 0 0 0.5rem;
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.figure strong {
		font-size: 1.9rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.unit {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.hint {
		color: var(--text-muted);
		font-size: 0.85rem;
		margin: 0.5rem 0 0;
	}

	/* A word before it is a position: the direction is stated, not only drawn. */
	.shift {
		margin: 0 0 0.75rem;
		padding-left: 0.6rem;
		border-left: 4px solid var(--dial-track);
		font-size: 0.9rem;
	}

	.shift[data-direction='up'] {
		border-left-color: var(--yes);
	}

	.shift[data-direction='down'] {
		border-left-color: var(--caution-border);
	}

	.sittings {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		font-size: 0.9rem;
	}

	.sittings li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		padding: 0.4rem 0;
		border-top: 1px solid var(--hair);
	}

	.sittings .what {
		color: var(--text-muted);
	}

	.sittings .score {
		margin-left: auto;
		font-variant-numeric: tabular-nums;
	}

	.split {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
		margin: 1rem 0 0;
	}

	.split dt {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.split dd {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.runs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.25rem;
		margin: 0.75rem 0 0;
		font-size: 0.9rem;
	}

	.more {
		margin: 0.75rem 0 0;
		font-size: 0.9rem;
	}

	.note {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
</style>
