<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import PhiNote from '$lib/components/PhiNote.svelte';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { tracker, todayIso, type FieldworkType } from '$lib/state/tracker.svelte.js';
	import { fieldworkCsv } from '$lib/tracker/csv.js';
	import { isSuperviseeCode, SUPERVISEE_CODE_HINT } from '$lib/tracker/phi.js';
	import { downloadBlob } from '$lib/util/download.js';

	onMount(() => void tracker.load());

	const uid = $props.id();

	// -- setup
	let startDate = $state(todayIso());
	let rulesetId = $state<'current' | '2027'>('current');
	let supervisorCode = $state('');

	// -- one month
	let month = $state(todayIso().slice(0, 7));
	let type = $state<FieldworkType>('supervised');
	let totalHours = $state(0);
	let unrestrictedHours = $state(0);
	let supervisionHours = $state(0);
	let individualSupervisionHours = $state(0);
	let contacts = $state(0);
	let observedWithClient = $state(false);
	let observationMinutes = $state(0);
	let note = $state('');

	const req = $derived(tracker.fieldworkRequirement);
	const rules = $derived(tracker.ruleset);
	const period = $derived(tracker.period);
	const months = $derived(tracker.myFieldworkMonths);
	const progress = $derived(tracker.fieldworkProgress);
	const countsMinutes = $derived(rules ? rules.observationMinutes !== null : false);

	const codeValid = $derived(isSuperviseeCode(supervisorCode.trim().toUpperCase()));

	async function start(e: SubmitEvent) {
		e.preventDefault();
		if (!codeValid) return;
		const p = await tracker.startFieldwork(startDate, rulesetId, supervisorCode);
		announcer.announce(`Fieldwork started ${p.startDate}`);
	}

	/** Loading a saved month back into the form, so a correction is an edit not a re-key. */
	function edit(m: (typeof months)[number]) {
		month = m.month;
		type = m.type;
		totalHours = m.totalHours;
		unrestrictedHours = m.unrestrictedHours;
		supervisionHours = m.supervisionHours;
		individualSupervisionHours = m.individualSupervisionHours;
		contacts = m.contacts;
		observedWithClient = m.observedWithClient;
		observationMinutes = m.observationMinutes;
		note = m.note;
		announcer.announce(`Editing ${m.month}`);
	}

	async function saveMonth(e: SubmitEvent) {
		e.preventDefault();
		if (!period || totalHours <= 0) return;
		await tracker.saveFieldworkMonth(period.id, month, {
			type,
			totalHours,
			unrestrictedHours,
			supervisionHours,
			individualSupervisionHours,
			contacts,
			observedWithClient,
			observationMinutes,
			note: note.trim()
		});
		note = '';
		announcer.announce(`Saved ${month}`);
	}

	function exportCsv() {
		const s = tracker.snapshot();
		downloadBlob(
			`fieldwork-${todayIso()}.csv`,
			fieldworkCsv(s.fieldworkMonths, s.fieldworkPeriods[0] ?? null),
			'text/csv;charset=utf-8'
		);
	}

	const fmtMonth = (m: string) =>
		new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});
</script>

<svelte:head>
	<title>Fieldwork hours — ABA Assist</title>
	<meta
		name="description"
		content="Track supervised fieldwork a month at a time, with the monthly floor, ceiling and supervision percentage checked as you go."
	/>
</svelte:head>

<nav aria-label="Breadcrumb" class="crumbs"><a href={resolve('/tools')}>Tools</a></nav>

<h1>Fieldwork hours</h1>

<div data-tracker-status={tracker.status} hidden></div>

{#if tracker.status === 'unavailable'}
	<p class="warn">This needs local storage and the browser has blocked it.</p>
{:else if !req || !rules}
	<p class="lede">No fieldwork requirement is modelled yet.</p>
{:else}
	<p class="lede">
		Fieldwork is verified one calendar month at a time, and a month that misses a requirement
		does not shrink — it is gone. That is what this checks: not a running total, but whether
		each month actually counted, while there is still time to do something about it.
	</p>

	{#if !period}
		<section class="setup">
			<h2>Start tracking</h2>
			<p class="hint">
				{req.totalHours} supervised hours, or {req.concentratedTotalHours} concentrated, inside
				{req.windowYears} years. Concentrated months need more supervision and more contacts, and
				are worth {req.concentratedMultiplier}× toward the total.
			</p>
			<form onsubmit={start}>
				<div class="grid">
					<div class="field">
						<label for="{uid}-start">First day of fieldwork</label>
						<input id="{uid}-start" type="date" bind:value={startDate} required />
					</div>
					<div class="field">
						<label for="{uid}-rules">Which requirements</label>
						<select id="{uid}-rules" bind:value={rulesetId}>
							{#each req.rulesets as r (r.id)}
								<option value={r.id}>{r.label}</option>
							{/each}
						</select>
					</div>
					<div class="field">
						<label for="{uid}-sup">Supervisor code</label>
						<input
							id="{uid}-sup"
							type="text"
							bind:value={supervisorCode}
							placeholder="S-01"
							autocapitalize="characters"
							autocomplete="off"
							spellcheck="false"
							aria-describedby="{uid}-sup-help"
							required
						/>
					</div>
				</div>
				<p class="hint" id="{uid}-sup-help">
					{#if supervisorCode && !codeValid}
						<span class="warn-text">{SUPERVISEE_CODE_HINT}</span>
					{:else}
						{SUPERVISEE_CODE_HINT} There is no name field here, on purpose.
					{/if}
				</p>
				<button type="submit" class="button primary" disabled={!codeValid}>
					Start tracking
				</button>
			</form>
		</section>
	{:else}
		{#if progress}
			<section class="progress">
				<h2>
					{progress.credited} of {progress.required} hours
					{#if progress.daysRemaining !== null}
						<span class="countdown" class:bad={progress.daysRemaining < 90}>
							{#if progress.expired}
								Window closed {-progress.daysRemaining} days ago
							{:else}
								{progress.daysRemaining} days left
							{/if}
						</span>
					{/if}
				</h2>
				<div
					class="bar"
					role="progressbar"
					aria-valuenow={progress.percent}
					aria-valuemin="0"
					aria-valuemax="100"
					aria-label="Fieldwork hours credited"
				>
					<span style="width: {progress.percent}%"></span>
				</div>
				<dl class="stats">
					<div>
						<dt>Credited</dt>
						<dd>{progress.credited}</dd>
					</div>
					<div>
						<dt>Remaining</dt>
						<dd>{progress.remaining}</dd>
					</div>
					<div>
						<dt>Months logged</dt>
						<dd>{progress.monthsLogged}</dd>
					</div>
					<div>
						<dt>Months short</dt>
						<dd class:bad={progress.monthsShort > 0}>{progress.monthsShort}</dd>
					</div>
					<div>
						<dt>Hours that will not count</dt>
						<dd class:bad={progress.forfeited > 0}>{progress.forfeited}</dd>
					</div>
				</dl>
				{#if progress.forfeited > 0}
					<p class="hint">
						Hours below a month's floor never count, and hours above its ceiling are dropped.
						That is the gap between what you logged and what is credited above.
					</p>
				{/if}
				<ul class="ratios">
					{#each progress.ratios as r (r.id)}
						<li>
							<strong>{r.label}</strong>
							<span class="detail">
								{r.value}% across everything logged, against {r.percent}% required.
							</span>
						</li>
					{/each}
				</ul>
				<p class="hint">
					Under {rules.label}, from {period.startDate} to {progress.deadline}, supervised by {period.supervisorCode}.
				</p>
			</section>
		{/if}

		<section>
			<h2>Log a month</h2>
			<p class="hint">
				Saving a month you have already logged replaces it, so a correction is an edit rather
				than a duplicate.
			</p>
			<form onsubmit={saveMonth}>
				<div class="grid">
					<div class="field">
						<label for="{uid}-month">Month</label>
						<input id="{uid}-month" type="month" bind:value={month} required />
					</div>
					<div class="field">
						<label for="{uid}-type">Fieldwork type</label>
						<select id="{uid}-type" bind:value={type}>
							<option value="supervised">Supervised</option>
							<option value="concentrated">Concentrated</option>
						</select>
					</div>
					<div class="field">
						<label for="{uid}-total">Total fieldwork hours</label>
						<input
							id="{uid}-total"
							type="number"
							min="0"
							max="400"
							step="0.25"
							bind:value={totalHours}
							required
						/>
					</div>
					<div class="field">
						<label for="{uid}-unrestricted">Unrestricted hours</label>
						<input
							id="{uid}-unrestricted"
							type="number"
							min="0"
							max="400"
							step="0.25"
							bind:value={unrestrictedHours}
						/>
					</div>
					<div class="field">
						<label for="{uid}-sv">Supervision hours</label>
						<input
							id="{uid}-sv"
							type="number"
							min="0"
							max="400"
							step="0.25"
							bind:value={supervisionHours}
						/>
					</div>
					<div class="field">
						<label for="{uid}-ind">Of that, one-to-one</label>
						<input
							id="{uid}-ind"
							type="number"
							min="0"
							max="400"
							step="0.25"
							bind:value={individualSupervisionHours}
						/>
					</div>
					<div class="field">
						<label for="{uid}-contacts">Supervisor contacts</label>
						<input id="{uid}-contacts" type="number" min="0" max="60" bind:value={contacts} />
					</div>
					{#if countsMinutes}
						<div class="field">
							<label for="{uid}-obs">Minutes observed with a client</label>
							<input
								id="{uid}-obs"
								type="number"
								min="0"
								max="2000"
								bind:value={observationMinutes}
							/>
						</div>
					{/if}
				</div>

				{#if !countsMinutes}
					<label class="switch">
						<input type="checkbox" bind:checked={observedWithClient} />
						<span>My supervisor observed me working with a client this month</span>
					</label>
				{/if}

				<PhiNote
					id="{uid}-note"
					bind:value={note}
					label="Anything worth remembering about this month"
					placeholder="Two weeks of the month were unrestricted — programme writing and graphing."
				/>

				<button type="submit" class="button primary">Save month</button>
			</form>
		</section>

		<section>
			<h2>By month</h2>
			{#if months.length === 0}
				<p class="hint">Nothing logged yet.</p>
			{:else}
				{#each months as m (m.id)}
					{@const s = tracker.fieldworkMonthSummary(m)}
					{#if s}
						<article class="month" data-standing={s.standing}>
							<h3>
								{fmtMonth(m.month)}
								<span class="standing">
									{#if s.standing === 'met'}Counts in full{:else if s.standing === 'short'}Short{:else}Incomplete{/if}
									— {s.creditedHours} credited
								</span>
							</h3>
							<p class="kind">{m.type === 'concentrated' ? 'Concentrated' : 'Supervised'}</p>
							<ul class="checks">
								{#each s.checks as c (c.id)}
									<li data-met={String(c.met)}>
										<span class="mark" aria-hidden="true"
											>{c.met === true ? '✓' : c.met === false ? '✗' : '?'}</span
										>
										<span>
											<strong>{c.label}</strong>
											<span class="detail">{c.detail}</span>
										</span>
									</li>
								{/each}
							</ul>
							{#if s.figures.length > 0}
								<ul class="checks figures">
									{#each s.figures as f (f.id)}
										<li>
											<span class="mark" aria-hidden="true">–</span>
											<span>
												<strong>{f.label}</strong>
												<span class="detail">{f.detail} {f.note}</span>
											</span>
										</li>
									{/each}
								</ul>
							{/if}
							{#if m.note}<p class="detail">{m.note}</p>{/if}
							<div class="actions">
								<button type="button" onclick={() => edit(m)}>Edit {m.month}</button>
								<button type="button" onclick={() => tracker.deleteFieldworkMonth(m.id)}>
									Delete {m.month}
								</button>
							</div>
						</article>
					{/if}
				{/each}
			{/if}
		</section>

		<section>
			<h2>Export</h2>
			<p class="hint">
				Fieldwork is verified from documentation, sometimes years later, and a record that
				exists only in this browser is one cleared cache away from gone.
			</p>
			<div class="actions">
				<button type="button" class="button" disabled={months.length === 0} onclick={exportCsv}
					>Fieldwork CSV</button
				>
			</div>
		</section>
	{/if}

	<section>
		<h2>What does not count</h2>
		<ul class="excluded">
			{#each req.excluded as x (x)}
				<li>{x}</li>
			{/each}
		</ul>
		<p class="note">
			Restated in our own words from the {tracker.handbookVersion} handbook, and the handbook is
			what governs. Your supervisor signs the monthly form; this is your copy of the arithmetic,
			not a substitute for theirs.
		</p>
	</section>

	{#if period}
		<section>
			<h2>Start over</h2>
			<p class="hint">Deletes this fieldwork period and every month logged against it.</p>
			<button type="button" onclick={() => tracker.deleteFieldworkPeriod(period.id)}>
				Delete fieldwork period
			</button>
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
	h2 {
		font-size: 1.15rem;
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
	select {
		font: inherit;
		padding: 0.6rem;
		min-height: var(--tap);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		color: var(--text);
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: var(--tap);
		font-weight: 400;
		margin: 0.5rem 0;
	}
	.progress h2 {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
		justify-content: space-between;
	}
	.countdown {
		font-size: 0.9rem;
		font-weight: 400;
		color: var(--text-muted);
	}
	.bar {
		height: 0.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--surface);
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin: 0.75rem 0 0;
	}
	.stats div {
		min-width: 5rem;
	}
	.stats dt {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.stats dd {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
	}
	.bad {
		color: var(--stop-text);
	}
	.ratios {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	.ratios .detail {
		display: block;
	}
	.month {
		border: 1px solid var(--border);
		border-left: 4px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
		margin-bottom: 0.75rem;
		background: var(--surface-raised);
	}
	/* Never colour alone: each row also carries a mark and a worded standing. */
	.month[data-standing='short'] {
		border-left-color: var(--stop-border);
	}
	.month[data-standing='met'] {
		border-left-color: var(--accent);
	}
	.month[data-standing='unknown'] {
		border-left-color: var(--caution-border);
	}
	.month h3 {
		font-size: 1rem;
		margin: 0 0 0.25rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
		justify-content: space-between;
	}
	.standing {
		font-size: 0.85rem;
		font-weight: 400;
		color: var(--text-muted);
	}
	.kind {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.checks {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	.figures {
		margin-top: 0.4rem;
		border-top: 1px solid var(--border);
		padding-top: 0.4rem;
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
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.excluded {
		padding-left: 1.2rem;
		display: grid;
		gap: 0.3rem;
	}
	.warn {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		border-radius: var(--radius);
		padding: 0.75rem;
	}
	.warn-text {
		color: var(--stop-text);
		font-weight: 600;
	}
	.note {
		color: var(--text-muted);
		font-size: 0.9rem;
		border-top: 1px solid var(--border);
		padding-top: 0.75rem;
	}
</style>
