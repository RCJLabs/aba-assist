<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { tracker, todayIso, type TrackedCredential } from '$lib/state/tracker.svelte.js';
	import { developmentCsv, fieldworkCsv, supervisionCsv } from '$lib/tracker/csv.js';
	import { downloadBlob } from '$lib/util/download.js';
	import FigureRows from '$lib/components/FigureRows.svelte';
	import { NO_FIGURE, type Figure } from '$lib/ui/figures.js';

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
	const fieldwork = $derived(tracker.period ? tracker.fieldworkProgress : null);

	/*
	 * The hub's figures, in the same form as the ones on the home page.
	 *
	 * These were three chips per card with a bare number each and no room for the sentence
	 * that makes a number readable — and two of them were coloured red for states that are
	 * not problems. A cycle sixteen months from its deadline is not "short"; a month with
	 * no service hours entered is not failing. Both now say what they are.
	 *
	 * The rows carry no link: the card's own heading is already the way in, and a nested
	 * link to the same page is a second tab stop saying the same thing.
	 */
	const supervisionFigures = $derived.by((): Figure[] => {
		const current = months.find((m) => m.month === thisMonth);
		const where = current ? tracker.workplaceLabel(current.workplaceId) : null;

		const thisMonthRow: Figure = current
			? current.standing === 'unknown'
				? {
						id: 'month',
						label: `This month at ${where}`,
						detail: 'Enter the hours you delivered and the percentage can be worked out.',
						value: NO_FIGURE,
						tone: 'unknown',
						note: 'not checked',
						href: null
					}
				: current.standing === 'short'
					? {
							id: 'month',
							label: `This month at ${where}`,
							detail: `Not met yet: ${current.checks
								.filter((c) => c.met === false)
								.map((c) => c.label)
								.join(', ')}.`,
							value: percentOf(current),
							tone: 'short',
							note: 'short',
							href: null
						}
					: {
							id: 'month',
							label: `This month at ${where}`,
							detail: 'Every monthly rule met.',
							value: percentOf(current),
							tone: 'neutral',
							note: null,
							href: null
						}
			: {
					id: 'month',
					label: 'This month',
					detail: 'Nothing logged yet.',
					value: NO_FIGURE,
					tone: 'unknown',
					note: 'not started',
					href: null
				};

		return [
			thisMonthRow,
			{
				id: 'months',
				label: 'Months logged',
				detail: 'Counted per organisation, because the rule is written per organisation.',
				value: String(months.length),
				tone: 'neutral',
				note: null,
				href: null
			},
			{
				id: 'contacts',
				label: 'Contacts logged',
				detail: 'Every real-time contact you have recorded, across all months.',
				value: String(tracker.entries.length),
				tone: 'neutral',
				note: null,
				href: null
			}
		];
	});

	/** The supervised share of the hours delivered, where the hours are known. */
	function percentOf(m: { supervisedHours: number; serviceHours: number | null }): string {
		if (!m.serviceHours) return NO_FIGURE;
		return `${Math.round((m.supervisedHours / m.serviceHours) * 1000) / 10}%`;
	}

	const developmentFigures = $derived.by((): Figure[] => {
		const c = cycleSummary;
		if (!c) return [];
		const when = c.expired
			? 'the cycle has ended'
			: `${c.daysRemaining} ${c.daysRemaining === 1 ? 'day' : 'days'} left in the cycle`;
		// There is no grace period and nothing carries over, so a cycle that ended still
		// owing units is the one state here that cannot be recovered from.
		const missedIt = c.remaining > 0 && c.expired;
		if (!c.requirementApplies) {
			return [
				{
					id: 'earned',
					label: 'Units recorded this cycle',
					detail: `The requirement starts with cycles ending ${tracker.developmentRequirement?.effectiveFrom}. This one is recorded, not scored.`,
					value: String(c.earned),
					tone: 'unknown',
					note: 'not scored',
					href: null
				}
			];
		}
		return [
			{
				id: 'earned',
				label: 'Earned this cycle',
				detail: c.remaining > 0 ? `${c.remaining} still needed · ${when}` : `All in · ${when}`,
				value: `${c.earned} of ${c.required}`,
				tone: missedIt ? 'short' : 'neutral',
				note: missedIt ? 'cycle ended' : null,
				href: null
			}
		];
	});

	const fieldworkFigures = $derived.by((): Figure[] => {
		const f = fieldwork;
		if (!f) return [];
		return [
			{
				id: 'credited',
				label: 'Hours credited',
				detail: `Of ${f.required}, counting only months that met their floor.`,
				value: String(f.credited),
				tone: 'neutral',
				note: null,
				href: null
			},
			{
				id: 'short',
				label: 'Months below the floor',
				detail: 'A month below its floor does not count at all, however many hours it holds.',
				value: String(f.monthsShort),
				tone: f.monthsShort > 0 ? 'short' : 'neutral',
				note: f.monthsShort > 0 ? 'forfeited' : null,
				href: null
			},
			{
				id: 'window',
				label: 'Days left in the window',
				detail: f.deadline ? `The period closes on ${f.deadline}.` : 'No start date set yet.',
				value: f.daysRemaining === null ? NO_FIGURE : String(f.daysRemaining),
				tone: f.expired ? 'short' : 'neutral',
				note: f.expired ? 'window closed' : null,
				href: null
			}
		];
	});

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

	<div class="cards" data-tracker={tracker.status}>
		<article class="card">
			<h2><a href={resolve('/tools/supervision')}>Supervision log</a></h2>
			{#if tracker.supervisionRequirement}
				{@const req = tracker.supervisionRequirement}
				<p>
					<!--
						The percentage is a range where a credential steps it down with experience,
						because stating the upper figure alone would read as the whole rule. The
						assistant-analyst requirement drops from 5% to 2% after the first 1,000 hours
						of post-certification practice, and the app has no way to know which applies.
					-->
					{#if req.reducedPercent !== null && req.reducedPercent !== undefined}
						{req.monthlyPercent}% of the hours you deliver each month for your first
						{req.reducedAfterServiceHours.toLocaleString()} hours of practice, then {req.reducedPercent}%
						— at every organisation, with {req.contactsPerMonth}
						{req.contactsPerMonth === 1 ? 'real-time contact' : 'real-time contacts'}.
					{:else}
						{req.monthlyPercent}% of the hours you deliver each month, at every organisation,
						with {req.contactsPerMonth}
						{req.contactsPerMonth === 1 ? 'real-time contact' : 'real-time contacts'}.
					{/if}
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
			<FigureRows rows={supervisionFigures} label="Supervision figures" />
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
			{#if developmentFigures.length > 0}
				<FigureRows rows={developmentFigures} label="Development figures" />
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
			{#if fieldworkFigures.length > 0}
				<FigureRows rows={fieldworkFigures} label="Fieldwork figures" />
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
