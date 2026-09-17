<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import PhiNote from '$lib/components/PhiNote.svelte';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import {
		tracker,
		todayIso,
		type ContactFormat,
		type ContactModality,
		type Supervisee
	} from '$lib/state/tracker.svelte.js';
	import { isSuperviseeCode, SUPERVISEE_CODE_HINT } from '$lib/tracker/phi.js';

	onMount(() => void tracker.load());

	const uid = $props.id();

	let workplaceLabel = $state('');
	let superviseeCode = $state('');
	let superviseeRole = $state<Supervisee['role']>('RBT');

	let date = $state(todayIso());
	let minutes = $state(30);
	let workplaceId = $state('');
	let superviseeId = $state('');
	let format = $state<ContactFormat>('individual');
	let modality = $state<ContactModality>('in-person');
	let observed = $state(true);
	let note = $state('');

	let hoursMonth = $state(todayIso().slice(0, 7));
	let hoursWorkplaceId = $state('');
	let hours = $state(0);

	const req = $derived(tracker.supervisionRequirement);
	const months = $derived(tracker.months);
	// Default the selects once a workplace exists, without clobbering a deliberate choice.
	$effect(() => {
		const first = tracker.workplaces[0]?.id ?? '';
		if (!workplaceId) workplaceId = first;
		if (!hoursWorkplaceId) hoursWorkplaceId = first;
	});

	const codeValid = $derived(isSuperviseeCode(superviseeCode.trim().toUpperCase()));
	const codeTaken = $derived(
		tracker.supervisees.some((s) => s.code === superviseeCode.trim().toUpperCase())
	);

	async function addWorkplace(e: SubmitEvent) {
		e.preventDefault();
		if (workplaceLabel.trim().length < 2) return;
		const w = await tracker.addWorkplace(workplaceLabel);
		workplaceLabel = '';
		workplaceId ||= w.id;
		hoursWorkplaceId ||= w.id;
		announcer.announce(`Added ${w.label}`);
	}

	async function addSupervisee(e: SubmitEvent) {
		e.preventDefault();
		if (!codeValid || codeTaken) return;
		const s = await tracker.addSupervisee(superviseeCode, superviseeRole);
		superviseeCode = '';
		announcer.announce(`Added ${s.code}`);
	}

	async function addContact(e: SubmitEvent) {
		e.preventDefault();
		if (!workplaceId || minutes <= 0) return;
		await tracker.addEntry({
			date,
			minutes,
			format,
			modality,
			observed,
			workplaceId,
			superviseeId: superviseeId || null,
			note: note.trim()
		});
		note = '';
		announcer.announce(`Logged ${minutes} minutes on ${date}`);
	}

	async function saveHours(e: SubmitEvent) {
		e.preventDefault();
		if (!hoursWorkplaceId || hours < 0) return;
		await tracker.setServiceHours(hoursMonth, hoursWorkplaceId, hours);
		announcer.announce(`Saved ${hours} service hours for ${hoursMonth}`);
	}

	const fmtMonth = (m: string) =>
		new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});
</script>

<svelte:head>
	<title>Supervision log — ABA Assist</title>
	<meta
		name="description"
		content="Log supervision contacts and check them against the monthly requirement."
	/>
</svelte:head>

<nav aria-label="Breadcrumb" class="crumbs"><a href={resolve('/tools')}>Tools</a></nav>

<h1>Supervision log</h1>

<div data-tracker-status={tracker.status} hidden></div>

{#if tracker.status === 'unavailable'}
	<p class="warn">This needs local storage and the browser has blocked it.</p>
{:else}
	{#if req}
		<p class="lede">
			Each calendar month, at each organization: at least {req.monthlyPercent}% of the hours
			you delivered, across at least {req.contactsPerMonth} real-time contacts, of which at least
			{req.observedContactsPerMonth} includes the supervisor watching you work with a client and
			at least {req.individualContactsPerMonth} is one-to-one. Groups may be up to {req.groupMax}
			technicians.
		</p>
	{:else}
		<p class="lede">
			Record the supervision you give. Each contact is filed against a supervisee's code, never
			a name.
		</p>
	{/if}

	{#if tracker.workplaces.length === 0}
		<section class="setup">
			<h2 class="section-head">Start with where you work</h2>
			<p>The requirement is per organization, so each one is counted separately.</p>
			<form onsubmit={addWorkplace}>
				<div class="field">
					<label for="{uid}-wp">Organization name</label>
					<input
						id="{uid}-wp"
						type="text"
						bind:value={workplaceLabel}
						placeholder="Riverside Clinic"
					/>
				</div>
				<button type="submit" class="button primary">Add organization</button>
			</form>
		</section>
	{:else}
		<section>
			<h2 class="section-head">Log a contact</h2>
			<form onsubmit={addContact}>
				<div class="grid">
					<div class="field">
						<label for="{uid}-date">Date</label>
						<input id="{uid}-date" type="date" bind:value={date} required />
					</div>
					<div class="field">
						<label for="{uid}-minutes">Minutes</label>
						<input
							id="{uid}-minutes"
							type="number"
							min="1"
							max="600"
							bind:value={minutes}
							required
						/>
					</div>
					<div class="field">
						<label for="{uid}-place">Organization</label>
						<select id="{uid}-place" bind:value={workplaceId}>
							{#each tracker.workplaces as w (w.id)}
								<option value={w.id}>{w.label}</option>
							{/each}
						</select>
					</div>
					<div class="field">
						<label for="{uid}-format">Format</label>
						<select id="{uid}-format" bind:value={format}>
							<option value="individual">One-to-one</option>
							<option value="small-group">Small group</option>
						</select>
					</div>
					<div class="field">
						<label for="{uid}-modality">How</label>
						<select id="{uid}-modality" bind:value={modality}>
							<option value="in-person">In person</option>
							<option value="live-video">Live video</option>
						</select>
					</div>
					{#if tracker.supervisees.length > 0}
						<div class="field">
							<label for="{uid}-supervisee">Supervisee</label>
							<select id="{uid}-supervisee" bind:value={superviseeId}>
								<option value="">Supervision I received</option>
								{#each tracker.supervisees as s (s.id)}
									<option value={s.id}>{s.code}</option>
								{/each}
							</select>
						</div>
					{/if}
				</div>

				<label class="switch">
					<input type="checkbox" bind:checked={observed} />
					<span>The supervisor observed me working with a client</span>
				</label>

				<PhiNote
					id="{uid}-note"
					bind:value={note}
					label="What the contact covered"
					placeholder="Reviewed the data sheet for the escape condition; practiced error correction."
				/>

				<button type="submit" class="button primary">Log contact</button>
			</form>
		</section>

		<section>
			<h2 class="section-head">Hours you delivered</h2>
			<p class="hint">
				The denominator of the percentage. Enter it once a month, per organization — until you
				do, this app will say it cannot work the percentage out rather than guess.
			</p>
			<form onsubmit={saveHours}>
				<div class="grid">
					<div class="field">
						<label for="{uid}-hmonth">Month</label>
						<input id="{uid}-hmonth" type="month" bind:value={hoursMonth} required />
					</div>
					<div class="field">
						<label for="{uid}-hplace">Organization</label>
						<select id="{uid}-hplace" bind:value={hoursWorkplaceId}>
							{#each tracker.workplaces as w (w.id)}
								<option value={w.id}>{w.label}</option>
							{/each}
						</select>
					</div>
					<div class="field">
						<label for="{uid}-hours">Service hours</label>
						<input
							id="{uid}-hours"
							type="number"
							min="0"
							max="800"
							step="0.25"
							bind:value={hours}
							required
						/>
					</div>
				</div>
				<button type="submit" class="button">Save hours</button>
			</form>
		</section>

		<section>
			<h2 class="section-head">Add an organization</h2>
			<form onsubmit={addWorkplace} class="inline">
				<div class="field">
					<label for="{uid}-wp2">Organization name</label>
					<input id="{uid}-wp2" type="text" bind:value={workplaceLabel} />
				</div>
				<button type="submit" class="button">Add</button>
			</form>
		</section>
	{/if}

	<section>
		<h2 class="section-head">People you supervise</h2>
		<p class="hint">{SUPERVISEE_CODE_HINT}</p>
		<form onsubmit={addSupervisee} class="inline">
			<div class="field">
				<label for="{uid}-code">Supervisee code</label>
				<input
					id="{uid}-code"
					type="text"
					bind:value={superviseeCode}
					placeholder="S-04"
					autocapitalize="characters"
					autocomplete="off"
					spellcheck="false"
					aria-describedby="{uid}-code-help"
				/>
			</div>
			<div class="field">
				<label for="{uid}-role">Role</label>
				<select id="{uid}-role" bind:value={superviseeRole}>
					<option value="RBT">RBT</option>
					<option value="BCaBA">BCaBA</option>
					<option value="trainee">Trainee</option>
				</select>
			</div>
			<button type="submit" class="button" disabled={!codeValid || codeTaken}>Add</button>
		</form>
		<p class="hint" id="{uid}-code-help">
			{#if superviseeCode && !codeValid}
				<span class="warn-text">{SUPERVISEE_CODE_HINT}</span>
			{:else if codeTaken}
				<span class="warn-text">That code is already in use.</span>
			{:else}
				There is no name field here, on purpose.
			{/if}
		</p>

		{#if tracker.supervisees.length > 0}
			<ul class="people">
				{#each tracker.supervisees as s (s.id)}
					<li>
						<span class="code">{s.code}</span>
						<span class="role">{s.role}</span>
						<button type="button" onclick={() => tracker.deleteSupervisee(s.id)}>
							Remove {s.code}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2 class="section-head">By month</h2>
		{#if months.length === 0}
			<p class="hint">Nothing logged yet.</p>
		{:else}
			{#each months as m (m.workplaceId + m.month)}
				<article class="month" data-standing={m.standing}>
					<h3>
						{fmtMonth(m.month)} — {tracker.workplaceLabel(m.workplaceId)}
						<span class="standing">
							{#if m.standing === 'met'}Requirements met{:else if m.standing === 'short'}Short{:else}Needs
								your service hours{/if}
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
					<details>
						<summary>{m.contacts} contact{m.contacts === 1 ? '' : 's'}</summary>
						<ul class="entries">
							{#each tracker.entriesFor(m.month, m.workplaceId) as e (e.id)}
								<li>
									<span>{e.date}</span>
									<span>{e.minutes} min</span>
									<span>{e.format === 'individual' ? 'one-to-one' : 'group'}</span>
									<span>{e.observed ? 'observed' : 'not observed'}</span>
									{#if tracker.superviseeCode(e.superviseeId)}
										<span class="code">{tracker.superviseeCode(e.superviseeId)}</span>
									{/if}
									{#if e.note}<span class="detail">{e.note}</span>{/if}
									<button type="button" onclick={() => tracker.deleteEntry(e.id)}>
										Delete contact on {e.date}
									</button>
								</li>
							{/each}
						</ul>
					</details>
				</article>
			{/each}
		{/if}
	</section>
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
	/*
	 * Wrap before crushing. Without a floor these fields shrink until the drop-down is
	 * narrower than the word inside it, which looks like a rendering fault rather than a
	 * tight layout.
	 */
	.inline .field {
		min-width: 7rem;
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
		margin: 0 0 0.5rem;
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
	.checks,
	.entries,
	.people {
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
	.entries li,
	.people li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		padding: 0.4rem 0;
		border-top: 1px solid var(--border);
	}
	.code {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.role {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	details summary {
		min-height: var(--tap);
		display: flex;
		align-items: center;
		cursor: pointer;
		color: var(--text-muted);
		font-size: 0.9rem;
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
</style>
