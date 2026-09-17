<script lang="ts">
	import { BOX, plotHeight, segments, xPix, yPix, type Axis } from '$lib/graph/scale.js';
	import { phasesFrom, pointsFrom, type PlotAnswer, type PlotTask } from '$lib/drills/plot.js';

	interface Props {
		task: PlotTask;
		answer: PlotAnswer;
		/** The session the controls are currently on, ringed so a tap lands somewhere visible. */
		selected?: number | null;
		/** Called with the session and the value under the pointer, snapped to a gridline. */
		onplace?: (x: number, y: number) => void;
		label: string;
	}

	let { task, answer, selected = null, onplace, label }: Props = $props();

	let svgEl: SVGSVGElement | undefined = $state();

	/*
	 * Half a session of margin at each end, so session one is not drawn on the vertical axis
	 * and session eight is not drawn on the frame. Each column is then a full session wide,
	 * which is what makes it a tap target rather than a line.
	 */
	const x: Axis = $derived({
		label: 'Session',
		from: 0.5,
		to: task.sessions.length + 0.5,
		tickEvery: 1,
		unit: 'session'
	});
	const y: Axis = $derived({
		label: task.unit,
		from: 0,
		to: task.yMax,
		tickEvery: task.tickEvery,
		unit: task.unit
	});

	const columnWidth = $derived(xPix(x, 2) - xPix(x, 1));

	/*
	 * The path, broken wherever it should be — at the reader's own phase line and at any
	 * session left blank. Both breaks come from `segments`, so the rule the published graphs
	 * are drawn by is the rule this one is drawn by, rather than a second implementation
	 * that agrees with it until it does not.
	 */
	const runs = $derived(segments(pointsFrom(answer), phasesFrom(task, answer.boundary), 1));

	const path = (run: { x: number; y: number }[]) =>
		run.map((p, i) => `${i === 0 ? 'M' : 'L'}${xPix(x, p.x)},${yPix(y, p.y)}`).join('');

	/** Viewbox coordinates from a pointer, via the SVG's own matrix rather than by arithmetic. */
	function place(event: PointerEvent, session: number) {
		if (!onplace || !svgEl) return;
		const ctm = svgEl.getScreenCTM();
		if (!ctm) return;
		const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
		const fraction = (BOX.top + plotHeight - local.y) / plotHeight;
		const value = Math.round(fraction * (y.to - y.from) + y.from);
		onplace(session, Math.max(y.from, Math.min(y.to, value)));
	}

	const gridlines = $derived(Array.from({ length: task.yMax + 1 }, (_, i) => i));
</script>

<!--
	The picture is hidden from assistive technology on purpose. Everything in it — every
	plotted value, the phase line, what is still blank — is in the button strip and the data
	table beside it, as text, and those are the controls anyway. A second narration of the
	same state read out as a chart would be noise, not an alternative.
-->
<svg
	bind:this={svgEl}
	viewBox="0 0 {BOX.width} {BOX.height}"
	class="plot"
	aria-hidden="true"
	data-plot={label}
>
	<g class="grid">
		{#each gridlines as v (v)}
			<line
				x1={BOX.left}
				y1={yPix(y, v)}
				x2={BOX.width - BOX.right}
				y2={yPix(y, v)}
				class:major={v % task.tickEvery === 0}
			/>
		{/each}
	</g>

	<g class="axis">
		<line x1={BOX.left} y1={BOX.top} x2={BOX.left} y2={BOX.top + plotHeight} />
		<line
			x1={BOX.left}
			y1={BOX.top + plotHeight}
			x2={BOX.width - BOX.right}
			y2={BOX.top + plotHeight}
		/>
	</g>

	<g class="ticks">
		{#each gridlines.filter((v) => v % task.tickEvery === 0) as v (v)}
			<text x={BOX.left - 9} y={yPix(y, v) + 4} text-anchor="end">{v}</text>
		{/each}
		{#each task.sessions as s (s.x)}
			<text x={xPix(x, s.x)} y={BOX.top + plotHeight + 19} text-anchor="middle">{s.x}</text>
		{/each}
	</g>

	<text class="axis-label" x={BOX.left} y={14}>{task.unit}</text>
	<text
		class="axis-label"
		x={(BOX.left + BOX.width - BOX.right) / 2}
		y={BOX.height - 6}
		text-anchor="middle">Session</text
	>

	{#if answer.boundary !== null}
		<g class="phase">
			<line
				x1={xPix(x, answer.boundary)}
				y1={BOX.top}
				x2={xPix(x, answer.boundary)}
				y2={BOX.top + plotHeight}
			/>
			<text x={xPix(x, answer.boundary) - 6} y={BOX.top - 6} text-anchor="end">
				{task.phaseLabels[0]}
			</text>
			<text x={xPix(x, answer.boundary) + 6} y={BOX.top - 6}>{task.phaseLabels[1]}</text>
		</g>
	{/if}

	<g class="data">
		{#each runs as run, i (i)}
			<path d={path(run)} />
		{/each}
		{#each pointsFrom(answer) as p (p.x)}
			<circle cx={xPix(x, p.x)} cy={yPix(y, p.y)} r="5" />
		{/each}
	</g>

	{#if onplace}
		<g class="columns">
			{#each task.sessions as s (s.x)}
				<!--
					The rule below asks whether this is reachable without a pointer. It is — but not
					here. The whole picture is aria-hidden, and every action it offers is also a real
					button in the strip beneath it, with a larger target and an arrow-key path. Giving
					these rects a role would add a second, worse copy of those controls to the
					accessibility tree rather than fix anything.
				-->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<rect
					x={xPix(x, s.x) - columnWidth / 2}
					y={BOX.top}
					width={columnWidth}
					height={plotHeight}
					class:on={selected === s.x}
					onpointerdown={(e) => place(e, s.x)}
				/>
			{/each}
		</g>
	{/if}
</svg>

<style>
	.plot {
		display: block;
		width: 100%;
		height: auto;
		touch-action: manipulation;
	}

	.grid line {
		stroke: var(--hair);
		stroke-width: 1;
	}

	.grid line.major {
		stroke: var(--border);
	}

	.axis line {
		stroke: var(--text);
		stroke-width: 2;
	}

	.ticks text,
	.axis-label {
		fill: var(--text-muted);
		font-size: 12px;
	}

	.axis-label {
		font-weight: 600;
	}

	/* Dashed and labelled, never a bare line: the label is what says which side is which. */
	.phase line {
		stroke: var(--text);
		stroke-width: 2;
		stroke-dasharray: 6 4;
	}

	.phase text {
		fill: var(--text);
		font-size: 12px;
		font-weight: 600;
	}

	.data path {
		fill: none;
		stroke: var(--dial-fill);
		stroke-width: 2.5;
	}

	.data circle {
		fill: var(--dial-fill);
		stroke: var(--bg);
		stroke-width: 1.5;
	}

	.columns rect {
		fill: transparent;
		cursor: crosshair;
	}

	/* The selected column is ringed so a tap lands somewhere the reader is already looking. */
	.columns rect.on {
		fill: var(--accent);
		fill-opacity: 0.08;
		stroke: var(--accent);
		stroke-width: 1.5;
		stroke-dasharray: 4 3;
	}
</style>
