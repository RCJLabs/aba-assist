<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import PrintHeader from '$lib/components/PrintHeader.svelte';
	import PrintButton from '$lib/components/PrintButton.svelte';
	import PhiNote from '$lib/components/PhiNote.svelte';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { tracker, todayIso, type FieldworkType } from '$lib/state/tracker.svelte.js';
	import { fieldworkCsv } from '$lib/tracker/csv.js';
	import { fieldworkRecord } from '$lib/tracker/fieldwork-export.js';
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
	let maxGroupSize = $state(0);
	let monthSupervisor = $state('');
	let verificationSigned = $state(false);
	let signedOn = $state('');
	let note = $state('');

	const req = $derived(tracker.fieldworkRequirement);
	const rules = $derived(tracker.ruleset);
	const period = $derived(tracker.period);
	const months = $derived(tracker.myFieldworkMonths);
	const progress = $derived(tracker.fieldworkProgress);
	const countsMinutes = $derived(rules ? rules.observationMinutes !== null : false);

	/*
	 * What identifies this record on paper. A supervisor code, never a name — the app has
	 * nowhere to put a name by construction, and that has to hold on the one artifact that
	 * leaves the device.
	 */
	const periodSubject = $derived(
		period
			? `${rules?.label ?? 'Fieldwork'} from ${period.startDate} · supervisor ${period.supervisorCode}`
			: null
	);

	const codeValid = $derived(isSuperviseeCode(supervisorCode.trim().toUpperCase()));

	const unsigned = $derived(tracker.unsignedFieldworkMonths);
	const standings = $derived(tracker.fieldworkStandings);

	/*
	 * The checklist is edited one supervisor at a time rather than all at once. Ticking a
	 * box here is a claim that somebody went and looked at a registry, and a screen of
	 * twenty checkboxes across four supervisors invites tapping through them.
	 */
	let editingSupervisor = $state<string | null>(null);
	let draftConfirmed = $state<string[]>([]);
	let draftContract = $state('');

	function editSupervisor(code: string) {
		const existing = tracker.fieldworkSupervisors.find(
			(c) => c.periodId === period?.id && c.code === code
		);
		draftConfirmed = [...(existing?.confirmed ?? [])];
		draftContract = existing?.contractSignedOn ?? '';
		editingSupervisor = code;
	}

	function toggleItem(id: string) {
		draftConfirmed = draftConfirmed.includes(id)
			? draftConfirmed.filter((x) => x !== id)
			: [...draftConfirmed, id];
	}

	async function saveSupervisor(e: SubmitEvent) {
		e.preventDefault();
		if (!period || !editingSupervisor) return;
		await tracker.saveSupervisorCheck(period.id, editingSupervisor, {
			confirmed: draftConfirmed,
			contractSignedOn: draftContract || null,
			note: ''
		});
		announcer.announce(`Saved what you confirmed about ${editingSupervisor}`);
		editingSupervisor = null;
	}
	const supervisors = $derived(tracker.fieldworkSupervisorCodes);

	/*
	 * The supervisor field starts filled from the last month logged, falling back to the
	 * one the run started with. Most months have the same supervisor as the month before,
	 * so typing it every time is a tax on the common case — but it is still a field, and a
	 * visible one, because the month it changes is the month somebody has to notice.
	 */
	const defaultSupervisor = $derived(
		months[0]?.supervisorCode || period?.supervisorCode || ''
	);
	const monthCodeValid = $derived(isSuperviseeCode(monthSupervisor.trim().toUpperCase()));
	$effect(() => {
		if (!monthSupervisor && defaultSupervisor) monthSupervisor = defaultSupervisor;
	});

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
		maxGroupSize = m.maxGroupSize;
		monthSupervisor = m.supervisorCode;
		verificationSigned = m.verificationSigned;
		signedOn = m.signedOn ?? '';
		note = m.note;
		announcer.announce(`Editing ${m.month}`);
	}

	async function saveMonth(e: SubmitEvent) {
		e.preventDefault();
		if (!period || totalHours <= 0 || !monthCodeValid) return;
		await tracker.saveFieldworkMonth(period.id, month, {
			type,
			totalHours,
			unrestrictedHours,
			supervisionHours,
			individualSupervisionHours,
			contacts,
			observedWithClient,
			observationMinutes,
			maxGroupSize,
			supervisorCode: monthSupervisor.trim().toUpperCase(),
			verificationSigned,
			// A signature with no date is half a record, so an unsigned month carries null
			// rather than whatever was last typed into the box.
			signedOn: verificationSigned && signedOn ? signedOn : null,
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

	/**
	 * The whole record, as four files.
	 *
	 * Sequential with a gap between them, because a browser asked for four downloads in
	 * the same tick drops all but the first. Most browsers ask once whether to allow
	 * several files; the hint below says so, so that being asked is not a surprise.
	 */
	async function exportRecord() {
		if (!req || !rules) return;
		const s = tracker.snapshot();
		const files = fieldworkRecord({
			period: s.fieldworkPeriods[0] ?? null,
			months: s.fieldworkMonths,
			supervisors: s.fieldworkSupervisors,
			req,
			rules,
			handbookVersion: tracker.fieldworkHandbookVersion,
			today: todayIso()
		});
		for (const f of files) {
			downloadBlob(f.name, f.csv, 'text/csv;charset=utf-8');
			await new Promise((r) => setTimeout(r, 250));
		}
		announcer.announce(`${files.length} files downloaded.`);
	}

	const fmtMonth = (m: string) =>
		new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});
</script>

<Seo
	title="Fieldwork hours"
	description="Track supervised fieldwork a month at a time, with the monthly floor, ceiling and supervision percentage checked as you go."
/>

<nav aria-label="Breadcrumb" class="crumbs"><a href={resolve('/tools')}>Tools</a></nav>

<h1>Fieldwork hours</h1>

<PrintHeader title="Supervised fieldwork" subject={periodSubject} />

<div data-tracker-status={tracker.status} hidden></div>

{#if tracker.status === 'unavailable'}
	<p class="warn">This needs local storage and the browser has blocked it.</p>
{:else if !req || !rules}
	<p class="lede">No fieldwork requirement is modeled yet.</p>
{:else}
	<p class="lede">
		Fieldwork is verified one calendar month at a time, and a month that misses a requirement
		does not shrink — it is gone. That is what this checks: not a running total, but whether
		each month actually counted, while there is still time to do something about it.
	</p>

	{#if !period}
		<section class="setup">
			<h2 class="section-head">Start tracking</h2>
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
			<section class="progress record">
				<h2 class="section-head">
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
						A month that misses a requirement is adjusted rather than simply kept or lost, and
						each requirement has its own adjustment. That is the gap between what you logged
						and what is credited above; each month below says which one applied.
					</p>
				{/if}
				<ul class="ratios">
					{#each progress.ratios as r (r.id)}
						<li>
							<strong>{r.label}</strong>
							<span class="detail">
								{r.value}% across everything logged, against {r.percent}% required{r.scope ===
								'month'
									? ' in each month — see the months below, not this total.'
									: ' across the whole experience.'}
							</span>
						</li>
					{/each}
				</ul>
				{#if unsigned.length > 0}
					<p class="hint unsigned-note">
						<strong
							>{unsigned.length}
							{unsigned.length === 1 ? 'month has' : 'months have'} no signed verification form yet:</strong
						>
						{[...unsigned]
							.map((m) => m.month)
							.sort()
							.join(', ')}. Those hours may well count — this is a separate question from
						whether they meet the rules — but unsigned they cannot be verified, and the
						supervisor who was there is easiest to reach now rather than a year from now.
					</p>
				{/if}
				<p class="hint">
					Under {rules.label}, from {period.startDate} to {progress.deadline}. Supervised by {supervisors.length ===
					0
						? period.supervisorCode
						: supervisors.join(', ')}.
				</p>
			</section>
		{/if}

		<section>
			<h2 class="section-head">Log a month</h2>
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
							aria-describedby="{uid}-total-help"
							required
						/>
						<!--
							"Total" reads as "the rest of it" to anyone entering supervision separately
							below, and a month entered that way is short by exactly the supervised
							hours — every month, in the same direction, which is the kind of error
							nobody notices until verification.
						-->
						<p class="hint" id="{uid}-total-help">
							Everything you accrued this month, including the hours your supervisor was
							present for. Not the independent hours on their own.
						</p>
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
					<div class="field">
						<label for="{uid}-group">Largest group meeting</label>
						<input
							id="{uid}-group"
							type="number"
							min="0"
							max="60"
							bind:value={maxGroupSize}
							aria-describedby="{uid}-group-help"
						/>
						<!--
							Kept, not judged. The handbook caps group size and this app has not read
							that figure at source; a threshold it invented would be worse than none.
							The number costs a moment now and cannot be reconstructed in two years.
						-->
						<p class="hint" id="{uid}-group-help">
							How many trainees were in the biggest group supervision meeting. Leave at 0 if
							none of your supervision was in a group.
						</p>
					</div>
					<div class="field">
						<label for="{uid}-msup">Supervisor this month</label>
						<input
							id="{uid}-msup"
							type="text"
							bind:value={monthSupervisor}
							placeholder="S-01"
							autocapitalize="characters"
							autocomplete="off"
							spellcheck="false"
							aria-describedby="{uid}-msup-help"
							required
						/>
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

				<p class="hint" id="{uid}-msup-help">
					{#if monthSupervisor && !monthCodeValid}
						<span class="warn-text">{SUPERVISEE_CODE_HINT}</span>
					{:else}
						A code, never a name. The monthly verification form is completed per supervisor, so
						this is recorded month by month rather than once for the whole run — if more than
						one person supervised a month, name the one who signs for it and put the other in
						the note.
					{/if}
				</p>

				{#if !countsMinutes}
					<label class="switch">
						<input type="checkbox" bind:checked={observedWithClient} />
						<span>My supervisor observed me working with a client this month</span>
					</label>
				{/if}

				<!--
					Signed, and when. Separate from every check above it: the rules decide whether
					this month's hours count, and a signature decides whether they can be shown to
					anybody. A month can be faultless on the first and missing on the second.
				-->
				<label class="switch">
					<input type="checkbox" bind:checked={verificationSigned} />
					<span>The monthly verification form for this month has been signed</span>
				</label>
				{#if verificationSigned}
					<div class="field narrow">
						<label for="{uid}-signed">Monthly form signed on</label>
						<input id="{uid}-signed" type="date" bind:value={signedOn} max={todayIso()} />
					</div>
				{/if}

				<PhiNote
					id="{uid}-note"
					bind:value={note}
					label="Anything worth remembering about this month"
					placeholder="Two weeks of the month were unrestricted — program writing and graphing."
				/>

				<button type="submit" class="button primary" disabled={!monthCodeValid}>
					Save month
				</button>
			</form>
		</section>

		<section class="record">
			<h2 class="section-head">By month</h2>
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
							<p class="kind">
								{m.type === 'concentrated' ? 'Concentrated' : 'Supervised'} · supervisor {m.supervisorCode ||
									'not recorded'}
								<span class="signed" data-signed={m.verificationSigned === true}>
									{#if m.verificationSigned}
										form signed{m.signedOn ? ` ${m.signedOn}` : ''}
									{:else}
										form not signed yet
									{/if}
								</span>
							</p>
							{#if s.creditNote}<p class="credit-note">{s.creditNote}</p>{/if}
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

		<!--
			Who supervised, and whether anybody checked they could.

			This is the largest single way to lose fieldwork and the only one invisible from
			a log of hours: hours supervised by somebody who did not meet the requirements
			are worth nothing, however faultless the month looks. It is also the one thing
			here the app cannot check — active certification, tenure and supervision training
			are facts about another person, on a registry this app cannot reach and must not
			cache. So it asks, records the answer with the date, and never pretends the
			answer is a verification.
		-->
		<section class="record supervisors">
			<h2 class="section-head">The people who supervised this</h2>
			<p class="hint">
				Hours supervised by somebody who did not meet the requirements do not count — not
				reduced, not prorated, gone. This app cannot check any of it for you: these are facts
				about another person, held on a registry it cannot reach. What it can do is ask, and
				keep your answer with the date you gave it.
				<strong>Ticking these is your confirmation, not a verification.</strong>
			</p>
			{#if standings.length === 0}
				<p class="hint">No months logged yet, so nobody to ask about.</p>
			{:else}
				{#each standings as st (st.code)}
					<article class="person" data-supervisor={st.code} data-state={st.state}>
						<h3>
							{st.code}
							<span class="standing">
								{#if st.state === 'confirmed'}
									Confirmed{st.confirmedOn ? ` ${st.confirmedOn}` : ''}
								{:else if st.state === 'incomplete'}
									Something is outstanding
								{:else}
									Not checked yet
								{/if}
							</span>
						</h3>
						<p class="detail">
							{st.months}
							{st.months === 1 ? 'month' : 'months'} of this record rest{st.months === 1
								? 's'
								: ''} on them.
							{#if st.contractSignedOn}
								Supervision contract signed {st.contractSignedOn}.
							{:else}
								No supervision contract date recorded.
							{/if}
						</p>
						{#if st.monthsBeforeContract.length > 0}
							<!--
								The one part of this that is arithmetic rather than somebody's say-so,
								so it is stated as a finding rather than a prompt.
							-->
							<p class="warn-text">
								Logged before that contract was signed: {st.monthsBeforeContract.join(', ')}.
								Hours accrued before a supervision contract exists do not count.
							</p>
						{/if}
						{#if st.outstanding.length > 0}
							<ul class="checks">
								{#each st.outstanding as item (item.id)}
									<li data-met="false">
										<span class="mark" aria-hidden="true">?</span>
										<span
											><strong>Not confirmed</strong>
											<span class="detail">{item.label}</span></span
										>
									</li>
								{/each}
							</ul>
						{/if}

						{#if editingSupervisor === st.code}
							<form class="no-print" onsubmit={saveSupervisor}>
								<fieldset>
									<legend>What you have checked about {st.code}</legend>
									{#each req.supervisor.items as item (item.id)}
										<label class="switch">
											<input
												type="checkbox"
												checked={draftConfirmed.includes(item.id)}
												onchange={() => toggleItem(item.id)}
											/>
											<span>{item.label}</span>
										</label>
									{/each}
								</fieldset>
								{#if req.supervisor.contractRequired}
									<div class="field narrow">
										<label for="{uid}-contract-{st.code}">Supervision contract signed on</label
										>
										<input
											id="{uid}-contract-{st.code}"
											type="date"
											bind:value={draftContract}
											max={todayIso()}
										/>
									</div>
								{/if}
								<div class="actions">
									<button type="submit" class="button primary">Save</button>
									<button type="button" onclick={() => (editingSupervisor = null)}>
										Cancel
									</button>
								</div>
							</form>
						{:else}
							<div class="actions no-print">
								<button type="button" onclick={() => editSupervisor(st.code)}>
									{st.state === 'unconfirmed' ? 'Check' : 'Update'}
									{st.code}
								</button>
							</div>
						{/if}
					</article>
				{/each}
				<p class="note">
					Restated in our own words from the {tracker.fieldworkHandbookVersion} handbook — {req
						.supervisor.locator}. The handbook is what governs.
				</p>
			{/if}
		</section>

		<!--
			The rules the verdicts above were reached under, on the same sheet of paper.
			The exported spreadsheet has carried this since it was written, for a reason
			stated there: a column saying "short" with no statement of the threshold asks
			the reader to trust an app they have never seen. The printout had exactly that
			flaw — the thresholds appear in each month's checks, but nothing said where any
			of them came from, so a supervisor reading it could not check one without
			opening the handbook and guessing at the page.
		-->
		<section class="record rules">
			<h2 class="section-head">The rules these figures were judged against</h2>
			<p class="hint">
				Restated in our own words from the {tracker.fieldworkHandbookVersion} handbook, with the
				page each came from. The handbook is what governs; where this disagrees with it, it is wrong.
			</p>
			<table class="refs">
				<thead>
					<tr
						><th scope="col">Requirement</th><th scope="col">Value</th><th scope="col"
							>Handbook</th
						></tr
					>
				</thead>
				<tbody>
					<tr>
						<th scope="row">Credited hours</th>
						<td
							>{req.totalHours} supervised, or {req.concentratedTotalHours} concentrated at {req.concentratedMultiplier}×
							each</td
						>
						<td>{req.locator}</td>
					</tr>
					<tr>
						<th scope="row">Years to finish in</th>
						<td>{req.windowYears}</td>
						<td>{req.locator}</td>
					</tr>
					<tr>
						<th scope="row">Hours in a countable month</th>
						<td>{rules.monthlyMinHours} to {rules.monthlyMaxHours}</td>
						<td>{rules.locator}</td>
					</tr>
					<tr>
						<th scope="row">Supervision</th>
						<td
							>{rules.supervisedPercent}% of hours, or {rules.concentratedPercent}%
							concentrated</td
						>
						<td>{rules.locator}</td>
					</tr>
					<tr>
						<th scope="row">Supervisor contacts</th>
						<td
							>{rules.supervisedContacts} a month, or {rules.concentratedContacts} concentrated</td
						>
						<td>{rules.locator}</td>
					</tr>
					<tr>
						<th scope="row">Observation with a client</th>
						<td>
							{rules.observationMinutes === null
								? 'at least one contact includes it'
								: `${rules.observationMinutes} minutes, or ${rules.concentratedObservationMinutes} concentrated`}
						</td>
						<td>{rules.locator}</td>
					</tr>
					{#each req.ratios as r (r.id)}
						<tr>
							<th scope="row">{r.label}</th>
							<td>at least {r.percent}% of {r.of}</td>
							<td>{r.locator}</td>
						</tr>
					{/each}
					<tr>
						<th scope="row">What has to be kept and signed</th>
						<td>a signed monthly verification form for every month, and a final one</td>
						<td>{req.documentationLocator}</td>
					</tr>
				</tbody>
			</table>
		</section>

		<!--
			The form at the end. A separate document from the monthly ones, and the last
			thing standing between a finished run and a submitted one — so it belongs on the
			record rather than being remembered.
		-->
		<section class="record final-form">
			<h2 class="section-head">The final verification form</h2>
			{#if period.finalFormSignedOn}
				<p>Signed {period.finalFormSignedOn}.</p>
			{:else}
				<p class="hint">
					Not signed yet. This is the form covering the whole experience, not the monthly ones
					— those are tracked against each month above.
					{#if progress && progress.remaining > 0}
						{progress.remaining} credited hours still to go.
					{/if}
				</p>
			{/if}
			<div class="field narrow no-print">
				<label for="{uid}-final">Final form signed on</label>
				<input
					id="{uid}-final"
					type="date"
					max={todayIso()}
					value={period.finalFormSignedOn ?? ''}
					onchange={(e) =>
						tracker.setFinalFormSigned(period.id, e.currentTarget.value || null)}
				/>
			</div>
		</section>

		<!--
			What the printout is, and what it is not. Same posture as the caseload page: a
			verification form is a document both parties sign and whose wording belongs to
			the certifying body, and producing something that looked like one would be this
			app claiming an authority it does not have. What it can honestly produce is the
			arithmetic and the evidence under it, with somewhere for both parties to sign
			that this is what they agreed.
		-->
		<section class="record attest">
			<h2 class="section-head">Signing it off</h2>
			<p>
				This is the month-by-month working behind every figure above, and the rules each month
				was measured against. Attach it to the monthly or final verification form your
				certifying body asks for. <strong>It is not that form</strong>, and this app does not
				have one.
			</p>
			<div class="signatures">
				<p><span class="line"></span><span class="who">Supervisor</span></p>
				<p><span class="line"></span><span class="who">Trainee</span></p>
				<p><span class="line short"></span><span class="who">Date</span></p>
			</div>
			<p class="no-print">
				<PrintButton label="Print this record or save it as a PDF" />
			</p>
		</section>

		<section>
			<h2 class="section-head">Export</h2>
			<p class="hint">
				Fieldwork is verified from documentation, sometimes years later, and a record that
				exists only in this browser is one cleared cache away from gone.
			</p>
			<div class="actions">
				<button type="button" class="button primary" onclick={exportRecord}>
					The whole record (5 files)
				</button>
				<button type="button" class="button" disabled={months.length === 0} onclick={exportCsv}
					>Just the months (1 file)</button
				>
			</div>
			<p class="hint">
				The five files are the run and its rules, the month-by-month log with a verdict on each
				month, the totals against the {req.totalHours} hours required and the unrestricted share,
				the requirements themselves with the handbook page each came from, and the supervisors with
				what you confirmed about each — so somebody reading it can check every figure without taking
				this app's word for anything. They open in Excel and in Google Sheets. Your browser may ask
				whether to allow several files at once.
			</p>
		</section>
	{/if}

	<section>
		<h2 class="section-head">What does not count</h2>
		<ul class="excluded">
			{#each req.excluded as x (x)}
				<li>{x}</li>
			{/each}
		</ul>
		<p class="note">
			Restated in our own words from the {tracker.fieldworkHandbookVersion} handbook, and the handbook
			is what governs. Your supervisor signs the monthly form; this is your copy of the arithmetic,
			not a substitute for theirs.
		</p>
	</section>

	{#if period}
		<section>
			<h2 class="section-head">Start over</h2>
			<p class="hint">Deletes this fieldwork period and every month logged against it.</p>
			<button type="button" onclick={() => tracker.deleteFieldworkPeriod(period.id)}>
				Delete fieldwork period
			</button>
		</section>
	{/if}
{/if}

<style>
	.narrow {
		max-width: 14rem;
	}

	.signed {
		display: inline-block;
		font-size: 0.85rem;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--border);
		border-radius: 0.25rem;
	}
	/* Never colour alone: the words differ too, and the border carries it in forced colors. */
	.signed[data-signed='false'] {
		color: var(--text);
		border-style: dashed;
	}

	.unsigned-note {
		border-left: 3px solid var(--border);
		padding-left: 0.6rem;
	}

	.refs {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	.refs th,
	.refs td {
		text-align: left;
		vertical-align: top;
		padding: 0.3rem 0.5rem 0.3rem 0;
		border-bottom: 1px solid var(--hair);
	}
	.refs th[scope='row'] {
		font-weight: 600;
		white-space: nowrap;
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

	/*
	 * On paper this page is a record, not a form. The sections that take input have nothing
	 * to say once they are printed, so only the ones marked `record` survive.
	 */
	@media print {
		.crumbs,
		.lede,
		h1,
		.no-print,
		section:not(.record) {
			display: none;
		}

		/*
		 * The rules and the signature block go last and together. A signature line that
		 * lands on its own page, or before the working it is attesting to, is the one part
		 * of a printed record that has to be got right.
		 */
		.attest {
			break-before: auto;
			break-inside: avoid;
		}
	}

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
	.credit-note {
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
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
