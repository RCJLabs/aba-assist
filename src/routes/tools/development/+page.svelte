<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import {
		tracker,
		todayIso,
		type UnitKind,
		type UnitTopic
	} from '$lib/state/tracker.svelte.js';

	onMount(() => void tracker.load());

	const uid = $props.id();

	let startDate = $state(todayIso());
	let supervisedOthers = $state(false);

	let date = $state(todayIso());
	let units = $state(1);
	let kind = $state<UnitKind>('learning');
	let topic = $state<UnitTopic>('general');
	let title = $state('');
	let provider = $state('');

	const req = $derived(tracker.developmentRequirement);
	/*
	 * The ledger still runs when the requirement is not modelled.
	 *
	 * Recording what you earned is useful on its own; what the app withholds in that case
	 * is the verdict, because the threshold to score it against has not been read. A unit
	 * is still a unit, so the form keeps a neutral label rather than borrowing the name
	 * another credential uses for its own.
	 */
	const unitLabel = $derived(req?.unitLabel ?? 'unit');
	const cycles = $derived(tracker.myCycles);
	const current = $derived(tracker.currentCycle);
	const summary = $derived(current ? tracker.summaryFor(current) : null);
	const stray = $derived(current ? tracker.strayUnits(current) : []);
	const recorded = $derived(
		current ? tracker.unitsFor(current.id).reduce((n, u) => n + u.units, 0) : 0
	);
	const isAnalyst = $derived(tracker.credential !== 'RBT');

	const KINDS: { value: UnitKind; label: string }[] = [
		{ value: 'learning', label: 'Authorized learning event' },
		{ value: 'in-service', label: 'Behavior-analytic in-service' },
		{ value: 'university-course', label: 'University course' },
		{ value: 'teaching', label: 'Teaching or instructing' },
		{ value: 'scholarship', label: 'Scholarship' }
	];

	async function addCycle(e: SubmitEvent) {
		e.preventDefault();
		const c = await tracker.addCycle(tracker.credential, startDate, supervisedOthers);
		announcer.announce(`Cycle added, ending ${c.endDate}`);
	}

	async function addUnit(e: SubmitEvent) {
		e.preventDefault();
		if (!current || units <= 0 || title.trim().length < 2) return;
		await tracker.addUnit({
			cycleId: current.id,
			date,
			units,
			kind,
			topic,
			title: title.trim(),
			provider: provider.trim()
		});
		title = '';
		provider = '';
		announcer.announce(`Added ${units} ${unitLabel}s`);
	}
</script>

<svelte:head>
	<title>Professional development — ABA Assist</title>
	<meta
		name="description"
		content="Track continuing education against your recertification cycle, on your own device."
	/>
</svelte:head>

<nav aria-label="Breadcrumb" class="crumbs"><a href={resolve('/tools')}>Tools</a></nav>

<h1>Professional development</h1>

<div data-tracker-status={tracker.status} hidden></div>

{#if tracker.status === 'unavailable'}
	<p class="warn">This needs local storage and the browser has blocked it.</p>
{:else}
	{#if req}
		<p class="lede">
			{req.unitsPerCycle}
			{req.unitLabel}s every {req.cycleYears} years{#if req.ethicsUnits}, including {req.ethicsUnits}
				on ethics{/if}{#if req.supervisionUnits}, and {req.supervisionUnits} on supervision in any
				cycle where you supervised somebody{/if}. Everything must be earned inside the cycle:
			nothing carries forward, and a shortfall cannot be made up afterwards.
		</p>
		{#if req.effectiveFrom}
			<p class="hint">This applies to cycles from {req.effectiveFrom}.</p>
		{/if}
	{:else}
		<p class="lede">
			The requirements for this credential have not been read into the app yet, so it will not
			tell you how many units you owe or whether you are on track. The ledger still works:
			record what you earned and check the totals against your own handbook.
		</p>
	{/if}

	{#if cycles.length === 0}
		<section class="setup">
			<h2 class="section-head">Set up your cycle</h2>
			<p class="hint">
				The start date is the day your current certification period began — usually the
				anniversary of the date you certified.
			</p>
			<form onsubmit={addCycle}>
				<div class="grid">
					<div class="field">
						<label for="{uid}-start">Cycle started</label>
						<input id="{uid}-start" type="date" bind:value={startDate} required />
					</div>
				</div>
				{#if isAnalyst}
					<label class="switch">
						<input type="checkbox" bind:checked={supervisedOthers} />
						<span>I supervised a technician, assistant analyst or trainee in this cycle</span>
					</label>
				{/if}
				<button type="submit" class="button primary">Add cycle</button>
			</form>
		</section>
	{:else if current}
		<section class="progress">
			<h2 class="section-head">
				Cycle to {current.endDate}
				{#if summary}
					<span class="countdown" class:bad={summary.daysRemaining < 60}>
						{#if summary.expired}
							Ended {-summary.daysRemaining} days ago
						{:else}
							{summary.daysRemaining} days left
						{/if}
					</span>
				{/if}
			</h2>

			{#if summary}
				<ul class="checks">
					{#each summary.checks as c (c.id)}
						<li data-met={String(c.met)}>
							<span class="mark" aria-hidden="true">{c.met ? '✓' : '✗'}</span>
							<span><strong>{c.label}</strong> <span class="detail">{c.detail}</span></span>
						</li>
					{/each}
				</ul>

				{#if summary.remaining > 0 && !summary.expired}
					<p class="remaining">
						{summary.remaining}
						{unitLabel}{summary.remaining === 1 ? '' : 's'} to go, in {summary.daysRemaining} days.
					</p>
				{/if}
			{:else}
				<p class="remaining">
					{recorded} recorded in this cycle. No total to check them against.
				</p>
			{/if}

			{#if stray.length > 0}
				<p class="warn" role="note">
					<strong
						>{stray.length}
						{stray.length === 1 ? 'entry is' : 'entries are'} dated outside this cycle.</strong
					>
					Nothing carries forward, so {stray.length === 1 ? 'it' : 'they'} will not count toward
					it.
				</p>
			{/if}

			{#if isAnalyst}
				<label class="switch">
					<input
						type="checkbox"
						checked={current.supervisedOthers}
						onchange={(e) => tracker.setSupervisedOthers(current.id, e.currentTarget.checked)}
					/>
					<span>I supervised somebody in this cycle</span>
				</label>
			{/if}
		</section>

		<section>
			<h2 class="section-head">Add units</h2>
			<form onsubmit={addUnit}>
				<div class="grid">
					<div class="field">
						<label for="{uid}-date">Date</label>
						<input id="{uid}-date" type="date" bind:value={date} required />
					</div>
					<div class="field">
						<label for="{uid}-units">{unitLabel}s</label>
						<input
							id="{uid}-units"
							type="number"
							min="0.5"
							max="40"
							step="0.5"
							bind:value={units}
							required
						/>
					</div>
					<div class="field">
						<label for="{uid}-kind">Type</label>
						<select id="{uid}-kind" bind:value={kind}>
							{#each KINDS as k (k.value)}
								<option value={k.value}>{k.label}</option>
							{/each}
						</select>
					</div>
					<div class="field">
						<label for="{uid}-topic">Counts toward</label>
						<select id="{uid}-topic" bind:value={topic}>
							<option value="general">The general total</option>
							<option value="ethics">Ethics</option>
							<option value="supervision">Supervision</option>
						</select>
					</div>
				</div>
				<div class="grid">
					<div class="field">
						<label for="{uid}-title">What it was</label>
						<input
							id="{uid}-title"
							type="text"
							bind:value={title}
							placeholder="Ethics in practice"
							required
						/>
					</div>
					<div class="field">
						<label for="{uid}-provider">Provider</label>
						<input
							id="{uid}-provider"
							type="text"
							bind:value={provider}
							placeholder="ACE provider name"
						/>
					</div>
				</div>
				<button type="submit" class="button primary">Add</button>
			</form>
			<p class="hint">
				Ongoing supervision, client-specific training and fieldwork toward another credential
				do not count. Neither does repeating something you already claimed.
			</p>
		</section>

		<section>
			<h2 class="section-head">Entries</h2>
			{#if tracker.unitsFor(current.id).length === 0}
				<p class="hint">Nothing recorded in this cycle yet.</p>
			{:else}
				<ul class="entries">
					{#each tracker.unitsFor(current.id) as u (u.id)}
						<li class:outside={u.date < current.startDate || u.date > current.endDate}>
							<span class="when">{u.date}</span>
							<span class="units">{u.units}</span>
							<span class="what">{u.title}</span>
							{#if u.topic !== 'general'}<span class="topic">{u.topic}</span>{/if}
							{#if u.provider}<span class="detail">{u.provider}</span>{/if}
							<button type="button" onclick={() => tracker.deleteUnit(u.id)}>
								Delete {u.title}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section>
			<h2 class="section-head">Cycles</h2>
			<ul class="entries">
				{#each cycles as c (c.id)}
					<li>
						<span class="when">{c.startDate} to {c.endDate}</span>
						<span class="detail">{tracker.unitsFor(c.id).length} entries</span>
						<button type="button" onclick={() => tracker.deleteCycle(c.id)}>
							Delete cycle ending {c.endDate}
						</button>
					</li>
				{/each}
			</ul>
			<form onsubmit={addCycle} class="inline">
				<div class="field">
					<label for="{uid}-start2">Add a cycle starting</label>
					<input id="{uid}-start2" type="date" bind:value={startDate} required />
				</div>
				<button type="submit" class="button">Add</button>
			</form>
		</section>
	{/if}
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
	.detail {
		color: var(--text-muted);
		font-size: 0.95rem;
	}
	section {
		margin: 1.5rem 0;
	}
	.countdown {
		font-size: 0.9rem;
		font-weight: 400;
		color: var(--text-muted);
	}
	.bad {
		color: var(--stop-text);
		font-weight: 700;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.field {
		display: grid;
		gap: 0.25rem;
	}
	label {
		font-weight: 600;
		font-size: 0.9rem;
	}
	input,
	.switch {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: var(--tap);
		font-weight: 400;
		margin: 0.5rem 0;
	}
	.inline {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: end;
	}
	.progress {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
		background: var(--surface-raised);
	}
	.checks,
	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	.checks li {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}
	.checks li[data-met='false'] .mark {
		color: var(--stop-text);
	}
	.mark {
		font-weight: 700;
		width: 1rem;
		flex: 0 0 auto;
	}
	.checks .detail {
		display: block;
	}
	.entries li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		padding: 0.4rem 0;
		border-top: 1px solid var(--border);
	}
	.entries li.outside {
		border-left: 4px solid var(--caution-border);
		padding-left: 0.5rem;
	}
	.when {
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
	}
	.units {
		font-weight: 700;
	}
	.what {
		flex: 1 1 8rem;
	}
	.topic {
		font-size: 0.8rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
	}
	.remaining {
		font-weight: 600;
	}
	.warn {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		border-radius: var(--radius);
		padding: 0.75rem;
	}
</style>
