<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { METHOD_LABELS } from '@aba/content-schema/runtime';
	import {
		loadReadiness,
		readinessKey,
		saveReadiness,
		type Readiness
	} from '$lib/state/readiness.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const a = $derived(data.assessment);

	let ready = $state<Readiness>({});
	onMount(() => {
		ready = loadReadiness();
	});

	const tasks = $derived(a ? a.sections.flatMap((s) => s.tasks) : []);
	const doneCount = $derived(
		a ? tasks.filter((t) => ready[readinessKey(a.id, t.number)]).length : 0
	);

	function toggle(number: number) {
		if (!a) return;
		const key = readinessKey(a.id, number);
		ready = { ...ready, [key]: !ready[key] };
		saveReadiness(ready);
		announcer.announce(
			`${ready[key] ? 'Marked ready' : 'Unmarked'}. ${doneCount} of ${tasks.length}.`
		);
	}

	/** A task assessed only by interview is prepared by rehearsing, not by doing. */
	const interviewOnly = (methods: readonly string[]) =>
		methods.length === 1 && methods[0] === 'interview';
</script>

<Seo
	title="Competency assessment"
	description="What the RBT Initial Competency Assessment asks you to demonstrate, task by task, with the material for each and a place to track what you are ready for."
/>

{#if !a}
	<h1>Competency assessment</h1>
	<p>Nothing is published for this credential yet.</p>
{:else}
	<h1>{a.name}</h1>
	<p class="lede">{a.ourOverview}</p>

	<p class="progress" role="status" data-ready={doneCount} data-total={tasks.length}>
		You have marked {doneCount} of {tasks.length} tasks as ready.
	</p>

	<p class="caution" role="note">
		<strong>This is your own judgment, not an assessment.</strong> Checking every box here certifies
		nothing. The assessment is a qualified assessor watching you do these things and signing the
		official form — this page is only somewhere to keep track of what you have practiced.
	</p>

	{#each a.sections as section (section.id)}
		<section aria-labelledby="sec-{section.id}">
			<h2 id="sec-{section.id}" class="section-head">{section.title}</h2>
			<p class="about">{section.ourDescription}</p>
			{#if section.sectionRule}
				<p class="rule" role="note">{section.sectionRule}</p>
			{/if}

			<ul class="tasks">
				{#each section.tasks as t (t.number)}
					<li class="task" data-task={t.number}>
						<label class="tick">
							<input
								type="checkbox"
								checked={ready[readinessKey(a.id, t.number)] ?? false}
								onchange={() => toggle(t.number)}
							/>
							<span class="sr">Mark task {t.number} as ready</span>
						</label>

						<div class="body">
							<h3><span class="num">{t.number}</span> {t.label}</h3>

							<p class="methods">
								{#each t.methods as m (m)}
									<!-- Never colour alone: each method is a word. -->
									<span class="method" class:client={m === 'with-a-client'}>
										{METHOD_LABELS[m]}
									</span>
								{/each}
								{#if interviewOnly(t.methods)}
									<span class="hint">— you will be asked to talk about this</span>
								{/if}
							</p>

							<p>{t.ourSummary}</p>

							{#if t.consultYourPolicy}
								<p class="policy" role="note">
									Your employer's protocol and your certified training are what prepare you for
									this one.
								</p>
							{/if}

							{#if t.demonstration.length > 0}
								<details class="rehearse">
									<summary>What to rehearse</summary>
									<div>
										<h4>A demonstration of this contains</h4>
										<ul class="does">
											{#each t.demonstration as d (d)}
												<li>{d}</li>
											{/each}
										</ul>
										{#if t.commonStops.length > 0}
											<h4>Where people come unstuck</h4>
											<ul class="stops">
												{#each t.commonStops as c (c)}
													<li>{c}</li>
												{/each}
											</ul>
										{/if}
										<p class="ours">
											Ours, not the assessor's. We have no access to a scoring rubric and this
											is not one — it is what we think doing the task well looks like, written
											so there is something specific to practice. Your assessor works from the
											packet.
										</p>
									</div>
								</details>
							{/if}

							{#if t.alternatives.length > 0}
								<ul class="alts">
									{#each t.alternatives as alt (alt.label)}
										<li>
											<strong>{alt.label}</strong>
											<p>{alt.ourSummary}</p>
											{#if alt.termRefs.length > 0}
												<p class="terms">
													{#each alt.termRefs.filter((id) => data.names[id]) as id (id)}
														<a href={resolve('/glossary/[slug]', { slug: id })}>
															{data.names[id]}
														</a>
													{/each}
												</p>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}

							{#if t.termRefs.length > 0}
								<p class="terms">
									{#each t.termRefs.filter((id) => data.names[id]) as id (id)}
										<a href={resolve('/glossary/[slug]', { slug: id })}>{data.names[id]}</a>
									{/each}
								</p>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	<section aria-labelledby="rules">
		<h2 id="rules" class="section-head">How the assessment runs</h2>
		<dl class="rules">
			{#each a.rules as r (r.label)}
				<dt>{r.label}</dt>
				<dd>{r.value}</dd>
			{/each}
		</dl>
	</section>

	<p class="source" role="note">
		Task names, numbering and the rules above are recorded from the assessor's packet; every
		description here is ours. The packet itself is the authority, it is the only form that will
		be accepted, and your assessor will be working from the current version of it.
	</p>
{/if}

<style>
	.rehearse {
		margin: 0.6rem 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.rehearse summary {
		padding: 0.5rem 0.7rem;
		min-height: var(--tap);
		display: flex;
		align-items: center;
		font-weight: 600;
		cursor: pointer;
	}

	.rehearse > div {
		padding: 0 0.7rem 0.6rem;
	}

	.rehearse h4 {
		font-size: 0.9rem;
		margin: 0.4rem 0 0.3rem;
	}

	.rehearse ul {
		margin: 0;
		padding-left: 1.1rem;
	}

	.rehearse li + li {
		margin-top: 0.35rem;
	}

	.stops {
		/* Never colour alone: the heading above already says what this list is. */
		border-left: 3px solid var(--stop-border, var(--border));
		padding-left: 1.1rem;
		margin-left: -0.15rem;
	}

	.ours {
		margin: 0.7rem 0 0;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	h1 {
		font-size: 1.5rem;
	}

	.lede {
		color: var(--text-muted);
		margin-top: 0;
	}

	.progress {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.caution,
	.rule,
	.policy,
	.source {
		border: 1px solid var(--border);
		border-left-width: 4px;
		border-radius: var(--radius);
		padding: 0.6rem 0.75rem;
		font-size: 0.9rem;
	}

	.caution {
		border-left-color: var(--caution-border, var(--border));
	}

	.policy {
		border-left-color: var(--stop-border, var(--border));
		margin: 0.5rem 0;
	}

	.about {
		color: var(--text-muted);
		margin-top: 0;
	}

	.tasks {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.task {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.75rem;
		padding: 0.85rem 0;
		border-top: 1px solid var(--border);
	}

	.tick {
		display: flex;
		align-items: flex-start;
		min-height: var(--tap);
		min-width: var(--tap);
		justify-content: center;
		padding-top: 0.2rem;
	}

	.tick input {
		width: 1.35rem;
		height: 1.35rem;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.body h3 {
		font-size: 1rem;
		margin: 0 0 0.35rem;
	}

	.num {
		display: inline-block;
		min-width: 1.6rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.body p {
		margin: 0 0 0.5rem;
	}

	.methods {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
	}

	.method {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
	}

	.method.client {
		color: var(--text);
		border-color: var(--accent);
	}

	.hint {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.alts {
		list-style: none;
		margin: 0 0 0.5rem;
		padding: 0 0 0 0.75rem;
		border-left: 2px solid var(--border);
	}

	.alts > li + li {
		margin-top: 0.6rem;
	}

	.terms {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.75rem;
		font-size: 0.9rem;
	}

	.rules {
		margin: 0;
	}

	.rules dt {
		font-weight: 700;
		margin-top: 0.75rem;
	}

	.rules dd {
		margin: 0.15rem 0 0;
		color: var(--text-muted);
	}

	.source {
		margin-top: 1.5rem;
		color: var(--text-muted);
	}
</style>
