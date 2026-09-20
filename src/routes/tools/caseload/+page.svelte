<script lang="ts">
	/**
	 * The supervisor's side of the supervision log.
	 *
	 * Everything else under `/tools` is first-person: your fieldwork, the supervision you
	 * received, your development units. An analyst supervising four technicians had
	 * nothing here, which is a strange gap — the technician has to receive the
	 * supervision, but the analyst is the one who has to be able to show it was delivered,
	 * per person, per month, if anybody asks.
	 *
	 * Contacts are not logged here. They are logged once, on the supervision page, with a
	 * supervisee selected; this reads them back the other way round. Two places to record
	 * the same contact is two places for them to disagree.
	 */
	import Seo from '$lib/components/Seo.svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import PrintHeader from '$lib/components/PrintHeader.svelte';
	import PrintButton from '$lib/components/PrintButton.svelte';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { tracker, todayIso } from '$lib/state/tracker.svelte.js';

	onMount(() => void tracker.load());

	const uid = $props.id();

	let hoursSuperviseeId = $state('');
	let hoursWorkplaceId = $state('');
	let hoursMonth = $state(todayIso().slice(0, 7));
	let hours = $state(0);

	const caseload = $derived(tracker.caseload);
	const supervisees = $derived(tracker.supervisees.filter((s) => s.active));

	// Default the selects once there is something to default them to, without overwriting
	// a deliberate choice.
	$effect(() => {
		if (!hoursSuperviseeId) hoursSuperviseeId = tracker.supervisees[0]?.id ?? '';
		if (!hoursWorkplaceId) hoursWorkplaceId = tracker.workplaces[0]?.id ?? '';
	});

	/** The months belonging to one supervisee, newest first. */
	const monthsFor = (superviseeId: string) =>
		caseload.filter((m) => m.superviseeId === superviseeId);

	const fmtMonth = (m: string) =>
		new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});

	const canSaveHours = $derived(
		hoursSuperviseeId !== '' && hoursWorkplaceId !== '' && /^\d{4}-\d{2}$/.test(hoursMonth)
	);

	async function saveHours(e: SubmitEvent) {
		e.preventDefault();
		if (!canSaveHours) return;
		await tracker.setSuperviseeHours(
			hoursSuperviseeId,
			hoursWorkplaceId,
			hoursMonth,
			Math.max(0, hours)
		);
		announcer.announce(
			`Recorded ${hours} hours for ${tracker.superviseeCode(hoursSuperviseeId)} in ${fmtMonth(hoursMonth)}.`
		);
	}
</script>

<Seo
	title="Who you supervise"
	description="A month-by-month record of the supervision you have delivered, one supervisee at a time, judged against the requirement and printable. No client data."
/>

<PrintHeader title="Supervision delivered" />

<!--
	The same signal the sibling tracker pages carry: the tests need to know the database
	has been read before asserting against what is on the page, and everything here is
	async. Hidden, so it is a marker rather than a rendered artefact.
-->
<div data-tracker-status={tracker.status} hidden></div>

<nav aria-label="Breadcrumb" class="crumbs"><a href={resolve('/tools')}>Tools</a></nav>

<h1>Who you supervise</h1>

{#if tracker.status === 'unavailable'}
	<p class="note" role="status">
		This device is not letting the app store anything — usually a private window or blocked
		site storage. Nothing here would be kept, so the form is not shown.
	</p>
{:else}
	<p class="lede">
		The same log as the <a href={resolve('/tools/supervision')}>supervision page</a>, read the
		other way round: what you delivered, to whom, month by month. Contacts are logged there,
		with a supervisee chosen. The one thing that has to be recorded here is how many hours each
		person worked, because the percentage is owed on
		<strong>their</strong> hours and nothing in this app knows them.
	</p>

	{#if supervisees.length === 0}
		<p class="note">
			No supervisees yet. Add them on the
			<a href={resolve('/tools/supervision')}>supervision page</a> — a code like S-04, never a name.
		</p>
	{:else}
		<section class="form-block no-print" aria-labelledby="{uid}-hours">
			<h2 id="{uid}-hours" class="section-head">Hours a supervisee worked</h2>
			<form onsubmit={saveHours}>
				<div class="row">
					<p class="field">
						<label for="{uid}-who">Supervisee</label>
						<select id="{uid}-who" bind:value={hoursSuperviseeId}>
							{#each tracker.supervisees as s (s.id)}
								<option value={s.id}>{s.code} — {s.role}</option>
							{/each}
						</select>
					</p>
					<p class="field">
						<label for="{uid}-where">Organization</label>
						<select id="{uid}-where" bind:value={hoursWorkplaceId}>
							{#each tracker.workplaces as w (w.id)}
								<option value={w.id}>{w.label}</option>
							{/each}
						</select>
					</p>
					<p class="field">
						<label for="{uid}-month">Month</label>
						<input id="{uid}-month" type="month" bind:value={hoursMonth} />
					</p>
					<p class="field">
						<label for="{uid}-hours-in">Hours they worked</label>
						<input id="{uid}-hours-in" type="number" min="0" step="0.25" bind:value={hours} />
					</p>
				</div>
				<button type="submit" class="primary" disabled={!canSaveHours}>
					Record these hours
				</button>
			</form>
			<p class="hint">
				As they reported them to you. On paper this is the same figure the technician gives
				their supervisor, and without it the percentage has no denominator — the month then
				reads as “could not be judged” rather than short, which is the honest answer.
			</p>
		</section>
	{/if}

	{#each supervisees as s (s.id)}
		{@const months = monthsFor(s.id)}
		<section class="person" aria-labelledby="{uid}-{s.id}">
			<h2 id="{uid}-{s.id}" class="section-head">
				<span class="code">{s.code}</span>
				<span class="role">{s.role}</span>
			</h2>

			<!--
				A fieldwork trainee is held to the fieldwork rule — a share of *fieldwork* hours
				with its own monthly floor and ceiling — not to the monthly ongoing-supervision
				percentage the technicians owe. Measuring them against the wrong one would be a
				confident wrong answer, so this says so and points at the tracker that knows.
			-->
			{#if !tracker.requirementForRole(s.role)}
				<p class="hint">
					A trainee accruing supervised fieldwork is not held to the monthly
					ongoing-supervision percentage — their rule is a share of fieldwork hours, with its
					own floor and ceiling each month.
					<a href={resolve('/tools/fieldwork')}>The fieldwork tracker</a> is where that rule
					lives. Contacts logged against {s.code} are still kept.
				</p>
			{:else if months.length === 0}
				<p class="hint">
					Nothing logged for {s.code} yet. Log a contact on the
					<a href={resolve('/tools/supervision')}>supervision page</a> and choose them from the supervisee
					list.
				</p>
			{:else}
				{#each months as m (m.workplaceId + m.month)}
					<article class="month" data-standing={m.standing} data-caseload-month>
						<h3>
							{fmtMonth(m.month)} — {tracker.workplaceLabel(m.workplaceId)}
							<span class="standing">
								{#if m.standing === 'met'}
									Requirements met
								{:else if m.standing === 'short'}
									Short
								{:else}
									Needs their hours
								{/if}
							</span>
						</h3>
						<ul class="checks">
							{#each m.checks as c (c.id)}
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
						<!--
							Listed rather than folded into a disclosure, unlike the reader's own
							log. A `<details>` cannot be reliably opened for printing — the
							browsers hide its content in a way CSS does not reach, and setting
							`open` from `beforeprint` races the print snapshot — and this page
							exists to be printed. A record whose evidence prints folded away is
							a claim with nothing under it. So what is on screen is what is on
							the paper, which for a record is the right way round.
						-->
						<h4>{m.contacts} contact{m.contacts === 1 ? '' : 's'}</h4>
						<ul class="entries">
							{#each tracker.contactsFor(s.id, m.workplaceId, m.month) as e (e.id)}
								<li>
									<span>{e.date}</span>
									<span>{e.minutes} min</span>
									<span>{e.format === 'individual' ? 'one-to-one' : 'group'}</span>
									<span>{e.modality === 'in-person' ? 'in person' : 'live video'}</span>
									<span>{e.observed ? 'observed with a client' : 'not observed'}</span>
									{#if e.note}<span class="detail">{e.note}</span>{/if}
								</li>
							{/each}
						</ul>
					</article>
				{/each}
			{/if}
		</section>
	{/each}

	{#if caseload.length > 0}
		<!--
			Described as a record rather than as a form, deliberately. A supervision
			attestation is a document both parties sign and whose wording belongs to the
			certifying body or the employer; producing something that looked like one would
			be this app claiming an authority it does not have. What it can honestly produce
			is the evidence: who, when, how long, what kind, and the rule each month was
			judged against.
		-->
		<section class="attest">
			<h2 class="section-head">Signing it off</h2>
			<p>
				Printing this gives you the month-by-month record behind each figure — dates, lengths,
				one-to-one or group, observed or not, and the requirement each month was measured
				against. Attach it to whatever form your organization or certifying body asks for. It
				is not that form, and this app does not have one.
			</p>
			<div class="signatures">
				<p><span class="line"></span><span class="who">Supervisor</span></p>
				<p><span class="line"></span><span class="who">Supervisee</span></p>
				<p><span class="line short"></span><span class="who">Date</span></p>
			</div>
			<p class="no-print">
				<PrintButton label="Print this record or save it as a PDF" />
			</p>
		</section>
	{/if}

	<p class="note">
		No client appears anywhere in this record, because there is nowhere to put one: a
		supervisee is a code, and the only free text is the note on a contact.
		<a href={resolve('/tools/supervision')}>Where the contacts are logged</a>.
	</p>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
	}

	.lede {
		color: var(--text-muted);
	}

	.person {
		margin-top: 1.5rem;
	}

	.section-head .code {
		font-variant-numeric: tabular-nums;
	}

	.role {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-left: 0.5rem;
	}

	.month {
		border: 1px solid var(--border);
		border-left-width: 4px;
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
		margin-bottom: 0.75rem;
		background: var(--surface-raised);
	}

	/* Never colour alone: each month also carries a worded standing and a mark per row. */
	.month[data-standing='short'] {
		border-left-color: var(--stop-border);
	}

	.month[data-standing='met'] {
		border-left-color: var(--accent);
	}

	.month[data-standing='unknown'] {
		border-left-color: var(--caution-border);
	}

	h4 {
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin: 0.75rem 0 0;
	}

	.month h3 {
		font-size: 1rem;
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	/*
	 * The standing is a word before it is a colour. Never colour alone for a verdict —
	 * the same rule the rest of the tracker holds to, and the reason each `.standing`
	 * carries its text.
	 */
	.standing {
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.standing {
		color: var(--text-muted);
	}

	.checks {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.checks li {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}

	.mark {
		font-weight: 700;
		min-width: 1em;
	}

	.detail {
		display: block;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.entries {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.entries li {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		font-size: 0.9rem;
		font-variant-numeric: tabular-nums;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1 1 10rem;
		margin: 0 0 0.5rem;
	}

	.hint {
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.signatures {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
		margin: 1rem 0;
	}

	.signatures p {
		flex: 1 1 12rem;
		margin: 0;
	}

	.line {
		display: block;
		border-bottom: 1px solid var(--text);
		height: 2rem;
	}

	.line.short {
		max-width: 8rem;
	}

	.who {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	@media print {
		/* On paper this is a record, not a page of the app. */
		.no-print,
		.crumbs,
		.lede,
		.form-block {
			display: none !important;
		}
	}
</style>
