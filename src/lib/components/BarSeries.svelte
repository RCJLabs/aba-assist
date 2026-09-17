<script lang="ts">
	/**
	 * One series of bars, and the numbers underneath it.
	 *
	 * Bars rather than a line, in both places this is used, for the same reason: the values
	 * are discrete events — a sitting, a day — and a line drawn between them asserts that
	 * something existed in the gaps. For the day chart that would be a lie about whether
	 * the deck was opened, which is the one thing the chart is there to show.
	 *
	 * There is no tooltip, which is a deliberate departure from how a chart on a desktop
	 * would be built. This one is read one-handed on a phone, where hover does not exist and
	 * a tap target smaller than a thumb is not a target. The numbers live in a table below
	 * instead — which is also what a screen reader, a printout and a greyscale screen get,
	 * so the accessible path is the same path rather than a consolation.
	 */
	interface Bar {
		/** Axis label. Only the first and last are drawn; all of them reach the table. */
		label: string;
		value: number;
		/** Optional longer form for the table row. */
		detail?: string;
	}

	interface Props {
		bars: Bar[];
		/** Top of the scale. Fixed at 100 for a percentage; the peak for a count. */
		max: number;
		/** The accessible name. Carries the same information the picture does, in words. */
		alt: string;
		/** Column heading for the value in the table. */
		valueLabel: string;
		unit?: string;
		/** Column heading for the label in the table. */
		labelHeading?: string;
		/**
		 * What the top of the plot means, in words.
		 *
		 * Added after looking at the thing: with no ceiling stated, a column of bars running
		 * from 48% to 81% reads as nine bars of roughly one height, because nothing says how
		 * far the box goes. The scale is never truncated to make the differences look bigger
		 * — that is the oldest lie in charting — so it has to be said instead.
		 */
		scale: string;
		/** The two ends of the axis. Defaults to the first and last bar labels. */
		axisStart?: string;
		axisEnd?: string;
	}

	const {
		bars,
		max,
		alt,
		valueLabel,
		unit = '',
		labelHeading = 'When',
		scale,
		axisStart,
		axisEnd
	}: Props = $props();

	/*
	 * Geometry in user units, scaled by the viewBox rather than measured from the DOM: the
	 * SVG shrinks to 320px as the same picture, so there is nothing to recompute on resize
	 * and no layout read on first paint.
	 */
	const H = 60;
	const GAP = 2;
	const width = $derived(bars.length * 10);
	const barWidth = $derived(Math.max(1, 10 - GAP));
	const ceiling = $derived(Math.max(max, 1));

	let open = $state(false);
</script>

<div class="series">
	<figure>
		<p class="scale">{scale}</p>
		<svg
			viewBox="0 0 {width} {H + 2}"
			preserveAspectRatio="none"
			role="img"
			aria-label={alt}
			class="plot"
		>
			<!-- The top of the scale, drawn once, so the empty space above a bar has a meaning. -->
			<line class="ceiling" x1="0" y1="0.5" x2={width} y2="0.5" />
			{#each bars as bar, i (bar.label)}
				{@const h = Math.min(H, (Math.max(0, bar.value) / ceiling) * H)}
				<!--
				Every bar gets a baseline tick, including the empty ones. A day with nothing in
				it has to be visibly a day rather than absent, or a month with four study
				sessions draws as four bars in a row.
			-->
				<rect class="foot" x={i * 10} y={H} width={barWidth} height="2" />
				{#if h > 0}
					<rect class="bar" x={i * 10} y={H - h} width={barWidth} height={h} rx="1.5" />
				{/if}
			{/each}
		</svg>

		<!--
			The two ends of the axis, and only those. A label under every bar is unreadable
			at thirty of them and pointless at five, and the exact values are in the table
			rather than crammed into the picture.
		-->
		<div class="axis">
			<span>{axisStart ?? bars[0]?.label ?? ''}</span>
			<span>{axisEnd ?? bars.at(-1)?.label ?? ''}</span>
		</div>
	</figure>

	<!--
		Not an afterthought for assistive technology: it is where the exact numbers are for
		everybody, since the bars are deliberately small and unlabelled.
	-->
	<details bind:open>
		<summary>{open ? 'Hide the numbers' : 'Show the numbers'}</summary>
		<table>
			<thead>
				<tr>
					<th scope="col">{labelHeading}</th>
					<th scope="col">{valueLabel}</th>
				</tr>
			</thead>
			<tbody>
				{#each bars as bar (bar.label)}
					<tr>
						<th scope="row">{bar.detail ?? bar.label}</th>
						<td>{bar.value}{unit}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</details>
</div>

<style>
	figure {
		margin: 0;
	}

	.series {
		margin: 0;
	}

	.plot {
		width: 100%;
		/*
		 * A fixed drawn height with `preserveAspectRatio: none`: the bars stretch to fill
		 * the width at any viewport, so thirty days is the same chart at 320px as at 900,
		 * narrower. Height is the encoding and stays put.
		 */
		height: 4.5rem;
		display: block;
	}

	.bar {
		fill: var(--dial-fill);
	}

	.foot {
		fill: var(--dial-track);
	}

	.ceiling {
		stroke: var(--hair);
		stroke-width: 1;
		/* The rule is a reference, not data: it must not thicken as the plot stretches. */
		vector-effect: non-scaling-stroke;
	}

	.scale {
		margin: 0 0 0.15rem;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.axis {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-top: 0.15rem;
	}

	details {
		margin-top: 0.5rem;
		font-size: 0.85rem;
	}

	summary {
		min-height: var(--tap);
		display: flex;
		align-items: center;
		color: var(--link);
		cursor: pointer;
	}

	table {
		border-collapse: collapse;
		width: 100%;
	}

	th,
	td {
		text-align: left;
		padding: 0.3rem 0.5rem 0.3rem 0;
		border-top: 1px solid var(--hair);
		font-weight: 400;
	}

	thead th {
		font-weight: 600;
		color: var(--text-muted);
	}

	td {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	/*
	 * Forced colours discard our fills, which would leave the bars and their baseline the
	 * same system colour and the chart unreadable as a chart. The data keeps the highlight
	 * and the baseline drops to plain text colour, the same split the coverage dial uses.
	 */
	@media (forced-colors: active) {
		.bar {
			fill: Highlight !important;
		}
		.foot {
			fill: CanvasText !important;
		}
		.ceiling {
			stroke: GrayText !important;
		}
	}
</style>
