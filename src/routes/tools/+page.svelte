<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { tracker, todayIso, type TrackedCredential } from '$lib/state/tracker.svelte.js';
	import { developmentCsv, fieldworkCsv, supervisionCsv } from '$lib/tracker/csv.js';
	import { downloadBlob } from '$lib/util/download.js';

	onMount(() => void tracker.load());

	const uid = $props.id();
	const CREDENTIALS: { value: TrackedCredential; label: string }[] = [
		{ value: 'RBT', label: 'Technician (RBT)' },
		{ value: 'BCaBA', label: 'Assistant analyst (BCaBA)' },
		{ value: 'BCBA', label: 'Analyst (BCBA)' }
	];

	const cycle = $derived(tracker.currentCycle);
	const cycleSummary = $derived(cycle ? tracker.summaryFor(cycle) : null);
	const months = $derived(tracker.months);
	const thisMonth = $derived(todayIso().slice(0, 7));
	const short = $derived(months.filter((m) => m.standing === 'short').length);
	const fieldwork = $derived(tracker.period ? tracker.fieldworkProgress : null);

	function exportSupervision() {
		const s = tracker.snapshot();
		downloadBlob(
			`supervision-${todayIso()}.csv`,
			supervisionCsv(s.entries, s.workplaces, s.supervisees, s.serviceMonths),
			'text/csv;charset=utf-8'
		);
	}

	function exportFieldwork() {
		const s = tracker.snapshot();
		downloadBlob(
			`fieldwork-${todayIso()}.csv`,
			fieldworkCsv(s.fieldworkMonths, s.fieldworkPeriods[0] ?? null),
			'text/csv;charset=utf-8'
		);
	}

	function exportDevelopment() {
		const s = tracker.snapshot();
		downloadBlob(
			`professional-development-${todayIso()}.csv`,
			developmentCsv(s.units, s.cycles),
			'text/csv;charset=utf-8'
		);
	}
</script>

<svelte:head>
	<title>Tools — ABA Assist</title>
	<meta
		name="description"
		content="Track supervision hours and professional development units on your own device, with no client data."
	/>
</svelte:head>

<h1>Tools</h1>

<p class="lede">
	Supervision and professional development, tracked on this device. No account, nothing sent
	anywhere, and no field in here can hold a client's name — a person you supervise is a code.
</p>

<div data-tracker-status={tracker.status} hidden></div>

{#if tracker.status === 'unavailable'}
	<p class="warn">
		This needs local storage and the browser has blocked it. Rather than appearing to record
		your hours and losing them, the tools are switched off.
	</p>
{:else}
	<div class="field">
		<label for="{uid}-credential">Track requirements for</label>
		<select
			id="{uid}-credential"
			value={tracker.credential}
			onchange={(e) => tracker.setCredential(e.currentTarget.value as TrackedCredential)}
		>
			{#each CREDENTIALS as c (c.value)}
				<option value={c.value}>{c.label}</option>
			{/each}
		</select>
	</div>

	<div class="cards">
		<article class="card">
			<h2><a href={resolve('/tools/supervision')}>Supervision log</a></h2>
			{#if tracker.supervisionRequirement}
				<p>
					{tracker.supervisionRequirement.monthlyPercent}% of the hours you deliver each month,
					at every organisation, with {tracker.supervisionRequirement.contactsPerMonth} real-time
					contacts.
				</p>
			{:else if tracker.credentialModelled}
				<p>
					An analyst's own certification is not maintained by being supervised. Use this to
					record the supervision you <em>give</em>, against each supervisee's code.
				</p>
			{:else}
				<p>
					This app has not read the requirements for your credential, so it will not tell you
					what your month has to reach. Log the contacts; check the threshold in your handbook.
				</p>
			{/if}
			<dl class="stats">
				<div>
					<dt>Months logged</dt>
					<dd>{months.length}</dd>
				</div>
				<div>
					<dt>Months short</dt>
					<dd class:bad={short > 0}>{short}</dd>
				</div>
				<div>
					<dt>Contacts</dt>
					<dd>{tracker.entries.length}</dd>
				</div>
			</dl>
			{#if months.length > 0}
				{@const current = months.find((m) => m.month === thisMonth)}
				{#if current}
					<p class="now">
						This month at {tracker.workplaceLabel(current.workplaceId)}:
						{#if current.standing === 'met'}on track{:else if current.standing === 'short'}short{:else}waiting
							on your service hours{/if}.
					</p>
				{/if}
			{/if}
		</article>

		<article class="card">
			<h2><a href={resolve('/tools/development')}>Professional development</a></h2>
			{#if tracker.developmentRequirement}
				{@const req = tracker.developmentRequirement}
				<p>
					{req.unitsPerCycle}
					{req.unitLabel}s every {req.cycleYears} years{#if req.ethicsUnits}, including {req.ethicsUnits}
						on ethics{/if}. Nothing carries forward.
				</p>
			{:else}
				<p>
					No unit requirement is modelled for this credential yet, so the ledger records what
					you earned without scoring it against a total.
				</p>
			{/if}
			{#if cycleSummary}
				<dl class="stats">
					<div>
						<dt>Earned</dt>
						<dd>{cycleSummary.earned} / {cycleSummary.required}</dd>
					</div>
					<div>
						<dt>Days left</dt>
						<dd class:bad={cycleSummary.daysRemaining < 60}>
							{cycleSummary.expired ? 'Ended' : cycleSummary.daysRemaining}
						</dd>
					</div>
					<div>
						<dt>Standing</dt>
						<dd class:bad={cycleSummary.standing === 'short'}>
							{cycleSummary.standing === 'met' ? 'Complete' : 'In progress'}
						</dd>
					</div>
				</dl>
			{:else}
				<p class="now">No cycle set up yet.</p>
			{/if}
		</article>
		<article class="card">
			<h2><a href={resolve('/tools/fieldwork')}>Fieldwork hours</a></h2>
			{#if tracker.fieldworkRequirement}
				{@const fw = tracker.fieldworkRequirement}
				<p>
					For analyst trainees: {fw.totalHours} supervised hours inside {fw.windowYears} years, checked
					one calendar month at a time. A month below its floor does not count at all.
				</p>
			{/if}
			{#if fieldwork}
				<dl class="stats">
					<div>
						<dt>Credited</dt>
						<dd>{fieldwork.credited}</dd>
					</div>
					<div>
						<dt>Months short</dt>
						<dd class:bad={fieldwork.monthsShort > 0}>{fieldwork.monthsShort}</dd>
					</div>
					<div>
						<dt>Days left</dt>
						<dd class:bad={fieldwork.daysRemaining !== null && fieldwork.daysRemaining < 90}>
							{fieldwork.daysRemaining ?? '—'}
						</dd>
					</div>
				</dl>
			{:else}
				<p class="now">Not tracking a fieldwork period yet.</p>
			{/if}
		</article>
		<article class="card">
			<h2><a href={resolve('/session')}>Session mode</a></h2>
			<p>
				The interval cue, what the note has to carry, and a definition lookup on one screen —
				so checking a word mid-session does not stop the clock or lose the tally.
			</p>
			<p class="now">Nothing to set up, and nothing is saved.</p>
		</article>
		<article class="card">
			<h2><a href={resolve('/tools/timer')}>Interval timer</a></h2>
			<p>
				A repeating cue for partial interval, whole interval and momentary time sampling, with
				a running percentage of intervals. Vibrates, so you can watch the learner rather than a
				clock.
			</p>
			<p class="now">Nothing to set up, and nothing is saved.</p>
		</article>
		<article class="card">
			<h2><a href={resolve('/tools/notes')}>Writing session notes</a></h2>
			<p>
				What a note usually has to carry and why, plus fourteen phrases people actually write
				and the same observation said so somebody else could have counted it.
			</p>
			<p class="now">Nothing to set up, and nothing is saved.</p>
		</article>
	</div>

	<section>
		<h2>Export</h2>
		<p>
			Both codes expect supervision documentation to be kept for seven years. A record that
			exists only in this browser is one cleared cache away from gone, so take a copy.
		</p>
		<div class="actions">
			<button
				type="button"
				class="button"
				disabled={tracker.entries.length === 0}
				onclick={exportSupervision}>Supervision CSV</button
			>
			<button
				type="button"
				class="button"
				disabled={tracker.units.length === 0}
				onclick={exportDevelopment}>Development CSV</button
			>
			<button
				type="button"
				class="button"
				disabled={tracker.myFieldworkMonths.length === 0}
				onclick={exportFieldwork}>Fieldwork CSV</button
			>
		</div>
	</section>

	{#if tracker.credentialModelled}
		<p class="note">
			Requirements here come from the {tracker.handbookVersion} handbook and are restated in our
			own words. They change. Where this app and your handbook differ, the handbook is right — and
			your supervisor or the certifying board is who to ask.
		</p>
	{:else}
		<p class="note">
			The requirements for this credential have not been read into the app yet, so it does not
			state any. It would be easy to show you the analyst's numbers instead, and they would be
			the wrong numbers. Log your hours and units here — that arithmetic is the same either way
			— and take the totals to your own handbook for the thresholds.
		</p>
	{/if}
{/if}

<style>
	h1 {
		font-size: 1.5rem;
	}
	.lede {
		color: var(--text-muted);
	}
	.field {
		display: grid;
		gap: 0.25rem;
		max-width: 22rem;
		margin-bottom: 1.25rem;
	}
	label {
		font-weight: 600;
		font-size: 0.9rem;
	}
	.cards {
		display: grid;
		gap: 1rem;
	}
	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
		background: var(--surface-raised);
	}
	.card h2 {
		margin-top: 0;
		font-size: 1.15rem;
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
	.now {
		color: var(--text-muted);
		font-size: 0.95rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.warn {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		border-radius: var(--radius);
		padding: 0.75rem;
	}
	.note {
		color: var(--text-muted);
		font-size: 0.9rem;
		border-top: 1px solid var(--border);
		padding-top: 0.75rem;
	}
</style>
