<script lang="ts">
	import type { GraphDoc } from '@aba/content-schema';
	import {
		BOX,
		boundaries,
		panels,
		plotHeight,
		segments,
		tables,
		ticks,
		xPix,
		yPix
	} from '$lib/graph/scale.js';

	let {
		graph,
		showCallouts = false,
		showTable = true
	}: { graph: GraphDoc; showCallouts?: boolean; showTable?: boolean } = $props();

	const uid = $props.id();
	const frames = $derived(panels(graph));
	const xTicks = $derived(ticks(graph.x));
	const yTicks = $derived(ticks(graph.y));
	const dataTables = $derived(tables(graph));

	/** Marker path for one point, so two series never differ by colour alone. */
	function marker(shape: string, cx: number, cy: number): string {
		const r = 4.2;
		if (shape === 'square') return `M${cx - r},${cy - r}h${2 * r}v${2 * r}h${-2 * r}z`;
		if (shape === 'triangle')
			return `M${cx},${cy - r - 1}L${cx + r + 1},${cy + r}L${cx - r - 1},${cy + r}z`;
		if (shape === 'diamond')
			return `M${cx},${cy - r - 1}L${cx + r + 1},${cy}L${cx},${cy + r + 1}L${cx - r - 1},${cy}z`;
		// A circle, drawn as a path so every marker is one element type.
		return `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0z`;
	}

	function line(points: { x: number; y: number }[]): string {
		return points
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${xPix(graph.x, p.x)},${yPix(graph.y, p.y)}`)
			.join('');
	}

	/** Keep a callout's text inside the frame, whichever way it was asked to sit. */
	function calloutAnchor(place: string): 'start' | 'middle' | 'end' {
		if (place === 'left') return 'end';
		if (place === 'right') return 'start';
		return 'middle';
	}
</script>

<figure class="graph">
	<figcaption>
		<strong>{graph.title}.</strong>
		{graph.gloss}.
		<span class="fictional"
			>The data are invented to show one thing, not taken from anyone.</span
		>
	</figcaption>

	{#each frames as panel, i (panel.id)}
		<svg
			viewBox="0 0 {BOX.width} {BOX.height}"
			role="img"
			aria-labelledby="{uid}-t-{i}"
			aria-describedby="{uid}-d"
			class="frame"
		>
			<title id="{uid}-t-{i}">
				{panel.label ? `${graph.title}: ${panel.label}` : graph.title}
			</title>

			<!-- Axes. Drawn before everything, so no data sits under a line. -->
			<g class="axis">
				<line x1={BOX.left} y1={BOX.top} x2={BOX.left} y2={BOX.top + plotHeight} />
				<line
					x1={BOX.left}
					y1={BOX.top + plotHeight}
					x2={BOX.width - BOX.right}
					y2={BOX.top + plotHeight}
				/>
			</g>

			<g class="ticks" aria-hidden="true">
				{#each yTicks as t (t)}
					<line x1={BOX.left - 5} y1={yPix(graph.y, t)} x2={BOX.left} y2={yPix(graph.y, t)} />
					<text x={BOX.left - 9} y={yPix(graph.y, t) + 4} text-anchor="end">{t}</text>
				{/each}
				{#each xTicks as t (t)}
					<line
						x1={xPix(graph.x, t)}
						y1={BOX.top + plotHeight}
						x2={xPix(graph.x, t)}
						y2={BOX.top + plotHeight + 5}
					/>
					{#if i === frames.length - 1}
						<text x={xPix(graph.x, t)} y={BOX.top + plotHeight + 19} text-anchor="middle">
							{t}
						</text>
					{/if}
				{/each}
			</g>

			<!-- One x-axis label for the whole figure, under the last tier that carries ticks. -->
			{#if i === frames.length - 1}
				<text
					class="axis-label"
					x={BOX.left + (BOX.width - BOX.left - BOX.right) / 2}
					y={BOX.height - 6}
					text-anchor="middle">{graph.x.label}</text
				>
			{/if}
			<text
				class="axis-label"
				transform="rotate(-90)"
				x={-(BOX.top + plotHeight / 2)}
				y={16}
				text-anchor="middle">{panel.label ?? graph.y.label}</text
			>

			<!--
				Phase-change lines and condition labels.

				The line sits between the last session of one condition and the first of the
				next, never on a data point: it marks the gap, not a session.
			-->
			<g class="phase-lines" aria-hidden="true">
				{#each boundaries(panel.phases) as b (b)}
					<line
						x1={xPix(graph.x, b)}
						y1={BOX.top}
						x2={xPix(graph.x, b)}
						y2={BOX.top + plotHeight}
					/>
				{/each}
			</g>
			<g class="phase-labels" aria-hidden="true">
				{#each panel.phases as p (p.id)}
					<text x={xPix(graph.x, (p.from + p.to) / 2)} y={BOX.top - 8} text-anchor="middle"
						>{p.label}</text
					>
				{/each}
			</g>

			<!-- The data. One path per condition, never across a phase line. -->
			{#each panel.series as s, si (s.id)}
				<g class="series" data-series={si}>
					{#each segments(s.points, panel.phases) as run, ri (ri)}
						<path class="path" d={line(run)} />
					{/each}
					{#each s.points as pt (pt.x)}
						<path
							class="marker"
							d={marker(s.marker, xPix(graph.x, pt.x), yPix(graph.y, pt.y))}
						/>
					{/each}
				</g>
			{/each}

			{#if showCallouts && i === 0}
				<g class="callouts" aria-hidden="true">
					{#each graph.callouts as c (c.id)}
						{@const cx = xPix(graph.x, c.at.x)}
						{@const cy = yPix(graph.y, c.at.y)}
						{@const dx = c.place === 'left' ? -12 : c.place === 'right' ? 12 : 0}
						{@const dy = c.place === 'below' ? 18 : c.place === 'above' ? -12 : 4}
						<line x1={cx} y1={cy} x2={cx + dx} y2={cy + dy - (dy < 0 ? -4 : 4)} />
						<text x={cx + dx} y={cy + dy} text-anchor={calloutAnchor(c.place)}>{c.label}</text>
					{/each}
				</g>
			{/if}
		</svg>
	{/each}

	<p id="{uid}-d" class="described">{graph.longDescription}</p>

	{#if graph.series.length > 1 && frames.length === 1}
		<ul class="legend">
			{#each graph.series as s, si (s.id)}
				<li data-series={si}>
					<svg viewBox="0 0 16 16" aria-hidden="true" class="swatch">
						<path class="path" d="M0,8L16,8" />
						<path class="marker" d={marker(s.marker, 8, 8)} />
					</svg>
					{s.label}
				</li>
			{/each}
		</ul>
	{/if}

	{#if showTable}
		<details class="data">
			<summary>The numbers behind this graph</summary>
			{#each dataTables as t (t.caption)}
				<div class="scroll">
					<table>
						<caption>{t.caption}</caption>
						<thead>
							<tr>
								{#each t.head as h (h)}
									<th scope="col">{h}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each t.rows as row (row[0])}
								<tr>
									<th scope="row">{row[0]}</th>
									{#each row.slice(1) as cell, ci (ci)}
										<td>{cell}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/each}
		</details>
	{/if}
</figure>

<style>
	.graph {
		margin: 0 0 1.5rem;
	}
	.frame {
		width: 100%;
		height: auto;
		display: block;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		/* Stacked tiers read as one figure, so only the outer edges get a radius. */
		margin-bottom: 0.4rem;
	}
	.axis line {
		stroke: var(--text);
		stroke-width: 1.5;
	}
	.ticks line {
		stroke: var(--text-muted);
		stroke-width: 1;
	}
	.ticks text,
	.phase-labels text,
	.callouts text {
		font-size: 12px;
		fill: var(--text-muted);
	}
	.axis-label {
		font-size: 13px;
		font-weight: 600;
		fill: var(--text);
	}
	.phase-labels text {
		font-weight: 600;
		fill: var(--text);
	}
	/*
	 * Dashed, which is the convention, and the only dashed line on the figure — so it
	 * reads as a phase change rather than as data even where colour is unavailable.
	 */
	.phase-lines line {
		stroke: var(--text);
		stroke-width: 1.5;
		stroke-dasharray: 5 4;
	}
	.callouts line {
		stroke: var(--text-muted);
		stroke-width: 1;
	}
	.series .path {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
	}
	.series .marker {
		fill: var(--accent);
		stroke: var(--surface-raised);
		stroke-width: 1;
	}
	/*
	 * Series two and three change colour AND shape. The shape is what the schema enforces
	 * and what survives a forced-colours theme; the colour is a convenience on top of it.
	 */
	.series[data-series='1'] .path,
	.legend li[data-series='1'] .path {
		stroke: var(--text);
	}
	.series[data-series='1'] .marker,
	.legend li[data-series='1'] .marker {
		fill: var(--text);
	}
	.series[data-series='2'] .path,
	.legend li[data-series='2'] .path {
		stroke: var(--text-muted);
	}
	.series[data-series='2'] .marker,
	.legend li[data-series='2'] .marker {
		fill: var(--text-muted);
	}
	@media (forced-colors: active) {
		.axis line,
		.phase-lines line,
		.series .path,
		.ticks line,
		.callouts line {
			stroke: CanvasText;
		}
		.series .marker {
			fill: CanvasText;
			stroke: Canvas;
		}
		.ticks text,
		.axis-label,
		.phase-labels text,
		.callouts text {
			fill: CanvasText;
		}
	}
	/* The long description is the figure's accessible description, read by reference. */
	.described {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.legend {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin: 0.25rem 0;
		padding: 0;
		font-size: 0.9rem;
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.swatch {
		width: 1.4rem;
		height: 1.4rem;
		flex: 0 0 auto;
	}
	figcaption {
		font-size: 0.9rem;
		color: var(--text-muted);
		margin-bottom: 0.5rem;
	}
	figcaption strong {
		color: var(--text);
	}
	.fictional {
		display: block;
	}
	.data summary {
		min-height: var(--tap);
		display: flex;
		align-items: center;
		cursor: pointer;
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.scroll {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		font-size: 0.9rem;
		margin-bottom: 0.75rem;
	}
	caption {
		text-align: left;
		font-size: 0.85rem;
		color: var(--text-muted);
		padding-bottom: 0.25rem;
	}
	th,
	td {
		border: 1px solid var(--border);
		padding: 0.3rem 0.6rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	thead th,
	tbody td:last-child {
		text-align: left;
	}
</style>
