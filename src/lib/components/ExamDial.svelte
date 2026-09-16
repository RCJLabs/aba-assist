<script lang="ts">
	/**
	 * The coverage dial.
	 *
	 * One arc per content area, sized by how much of the exam that area is worth and
	 * filled by how many of its tasks the reader has been asked about. Behavior
	 * Acquisition is a quarter of the RBT paper, so it is a quarter of the ring — which
	 * makes an unfilled arc there visibly a bigger problem than an unfilled arc in an
	 * area worth a tenth. No percentage tells you that.
	 *
	 * Three things this deliberately does not do:
	 *
	 * - **No figure in the centre that reads as a score.** The centre holds a countdown
	 *   and a count of tasks, both of which are facts. A percentage there would be read
	 *   as readiness, and this app has refused to state a readiness figure everywhere
	 *   else for the good reason that a bank written by one author cannot support one.
	 * - **No prediction.** A full ring means every area has been met at least once. It
	 *   does not mean ready, and the caption says so rather than leaving it implied.
	 * - **No shape-only description.** The accessible name lists the areas with their
	 *   numbers, because "a ring, mostly unfilled" is not equivalent information and a
	 *   one-number summary would hand a screen-reader user the very figure the visual
	 *   design refuses to show.
	 */
	import {
		dialAltText,
		dialLabels,
		dialSegments,
		totalCoverage,
		type CoverageDomain
	} from '$lib/study/coverage.js';

	interface Props {
		credential: string;
		domains: CoverageDomain[];
		/** Whole days to the exam, or null when no date has been given. */
		days: number | null;
	}

	const { credential, domains, days }: Props = $props();

	/*
	 * Geometry, in one place.
	 *
	 * The ring is a radius of 94 with a 17-unit stroke, centred at 114 — so its outer edge
	 * reaches 102.5 and the letters sit at 114. That puts a letter at three o'clock exactly
	 * on x = 228, which is why the box is inset: a 228-wide viewBox clipped B and E in half.
	 * The SVG scales rather than reflowing, so 320px is the same picture, smaller.
	 */
	const R = 94;
	const CX = 114;
	const GAP = 3;
	const LABEL_OFFSET = 20;
	/** Room for a letter and its descender-free cap height on every side. */
	const INSET = 16;
	const BOX = CX * 2 + INSET * 2;

	const geometry = $derived(dialSegments(domains, { radius: R, gap: GAP }));
	const total = $derived(totalCoverage(domains));
	const alt = $derived(dialAltText(domains, total, credential, days));
	const labels = $derived(
		dialLabels(geometry, { centre: CX, gap: GAP, offset: LABEL_OFFSET })
	);
</script>

<div class="dial">
	<svg viewBox="{-INSET} {-INSET} {BOX} {BOX}" role="img" aria-label={alt}>
		<g fill="none" stroke-width="17" stroke-linecap="butt">
			<g class="track">
				{#each geometry.segments as s (s.letter)}
					<circle
						cx={CX}
						cy={CX}
						r={R}
						stroke-dasharray="{s.length} {geometry.circumference}"
						transform="rotate({s.rotation} {CX} {CX})"
					/>
				{/each}
			</g>
			<g class="fill">
				{#each geometry.segments as s (s.letter)}
					{#if s.filled > 0}
						<circle
							cx={CX}
							cy={CX}
							r={R}
							stroke-dasharray="{s.filled} {geometry.circumference}"
							transform="rotate({s.rotation} {CX} {CX})"
						/>
					{/if}
				{/each}
			</g>
		</g>

		<g class="letters" text-anchor="middle">
			{#each labels as l (l.letter)}
				<text x={l.x} y={l.y}>{l.letter}</text>
			{/each}
		</g>

		{#if days !== null}
			<text class="big" x={CX} y="106" text-anchor="middle">{Math.abs(days)}</text>
			<text class="unit" x={CX} y="126" text-anchor="middle">
				{#if days > 0}
					{days === 1 ? 'day left' : 'days left'}
				{:else if days === 0}
					exam today
				{:else}
					{days === -1 ? 'day ago' : 'days ago'}
				{/if}
			</text>
			<text class="count" x={CX} y="150" text-anchor="middle"
				>{total.seen} of {total.total} tasks</text
			>
		{:else}
			<!--
				Two lines, not three. With no date there is nothing to count down to, and
				"examined" on a line of its own read like a caption that had come adrift —
				the heading above the ring already says what the number is about.
			-->
			<text class="big" x={CX} y="118" text-anchor="middle">{total.seen}</text>
			<text class="unit" x={CX} y="140" text-anchor="middle">of {total.total} tasks</text>
		{/if}
	</svg>

	<p class="legend">
		<span><i class="swatch track"></i>Share of the exam</span>
		<span><i class="swatch fill"></i>Examined</span>
	</p>
</div>

<style>
	.dial {
		display: grid;
		justify-items: center;
		gap: 0.4rem;
	}

	svg {
		/* Scales instead of reflowing, so 320px is the same picture, smaller. */
		width: min(100%, 15rem);
		height: auto;
	}

	.track circle {
		stroke: var(--dial-track);
	}

	.fill circle {
		stroke: var(--dial-fill);
	}

	.letters text {
		font-size: 11px;
		font-weight: 600;
		fill: var(--text-muted);
	}

	.big {
		font-size: 50px;
		font-weight: 800;
		letter-spacing: -2px;
		fill: var(--text);
	}

	.unit {
		font-size: 11px;
		letter-spacing: 1px;
		text-transform: uppercase;
		fill: var(--text-muted);
	}

	.count {
		font-size: 13px;
		font-weight: 600;
		fill: var(--text);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.25rem 1rem;
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.swatch {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 2px;
		/* A swatch with no border vanishes entirely under a forced palette. */
		border: 1px solid var(--border);
	}

	.swatch.track {
		background: var(--dial-track);
	}

	.swatch.fill {
		background: var(--dial-fill);
	}

	/*
	 * Windows High Contrast throws our palette away, which would leave both arcs the
	 * same system colour and the ring meaningless. The fill keeps the highlight colour
	 * and the track drops to the plain text colour, so the two are still told apart.
	 */
	@media (forced-colors: active) {
		.track circle {
			stroke: CanvasText !important;
			stroke-opacity: 0.45;
		}
		.fill circle {
			stroke: Highlight !important;
		}
		.swatch.track {
			background: CanvasText !important;
		}
		.swatch.fill {
			background: Highlight !important;
		}
	}
</style>
