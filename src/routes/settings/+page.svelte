<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { settings, type Theme, type Hand } from '$lib/state/settings.svelte.js';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { storage, NUDGE_AFTER_DAYS } from '$lib/state/storage.svelte.js';

	const uid = $props.id();
	let fileInput: HTMLInputElement | null = $state(null);
	let confirmingErase = $state(false);
	let confirmingImport = $state<File | null>(null);

	onMount(() => storage.load());

	function chooseFile(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		// Confirm before touching anything: restoring replaces what is here.
		if (file) confirmingImport = file;
	}

	async function doImport() {
		const file = confirmingImport;
		confirmingImport = null;
		if (!file) return;
		await storage.importBackup(file);
		if (fileInput) fileInput.value = '';
		announcer.announce(storage.message, 'assertive');
	}

	async function doExport() {
		await storage.exportBackup();
		announcer.announce(storage.message);
	}

	async function doErase() {
		confirmingErase = false;
		await storage.eraseEverything();
		announcer.announce(storage.message, 'assertive');
	}

	const themes: { value: Theme; label: string }[] = [
		{ value: 'system', label: 'Match my device' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	const hands: { value: Hand; label: string }[] = [
		{ value: 'right', label: 'Right hand' },
		{ value: 'left', label: 'Left hand' }
	];

	const sizes = [
		{ value: 1, label: 'Default' },
		{ value: 1.15, label: 'Large' },
		{ value: 1.3, label: 'Larger' }
	];

	function setOneHanded(on: boolean) {
		settings.set('oneHanded', on);
		announcer.announce(on ? 'One-handed mode on' : 'One-handed mode off');
	}
</script>

<svelte:head>
	<title>Settings — ABA Assist</title>
	<meta
		name="description"
		content="Display, reading and accessibility settings for ABA Assist."
	/>
</svelte:head>

<h1>Settings</h1>

<section>
	<h2 id="theme-label">Theme</h2>
	<div class="options" role="radiogroup" aria-labelledby="theme-label">
		{#each themes as t (t.value)}
			<label class="option">
				<input
					type="radio"
					name="theme"
					value={t.value}
					checked={settings.theme === t.value}
					onchange={() => settings.set('theme', t.value)}
				/>
				<span>{t.label}</span>
			</label>
		{/each}
	</div>
</section>

<section>
	<h2 id="size-label">Text size</h2>
	<div class="options" role="radiogroup" aria-labelledby="size-label">
		{#each sizes as s (s.value)}
			<label class="option">
				<input
					type="radio"
					name="size"
					value={s.value}
					checked={settings.fontScale === s.value}
					onchange={() => settings.set('fontScale', s.value)}
				/>
				<span>{s.label}</span>
			</label>
		{/each}
	</div>
	<p class="hint">
		Your device's own text-size setting works too — this is here for when you cannot change it,
		such as on a shared or managed phone.
	</p>
</section>

<section>
	<h2>Reading</h2>
	<label class="switch">
		<input
			type="checkbox"
			checked={settings.plainLanguage}
			onchange={(e) => settings.set('plainLanguage', e.currentTarget.checked)}
		/>
		<span>
			<strong>Show plain language first</strong>
			<small>
				Every term has a technical definition and a plain-language one. This chooses which you
				see by default; you can always switch on the page itself.
			</small>
		</span>
	</label>
</section>

<section>
	<h2>One-handed use</h2>
	<label class="switch">
		<input
			type="checkbox"
			checked={settings.oneHanded}
			onchange={(e) => setOneHanded(e.currentTarget.checked)}
		/>
		<span>
			<strong>One-handed mode</strong>
			<small>
				Enlarges text slightly and moves page actions into a bar at the bottom of the screen,
				within reach of your thumb. Useful when your other hand is busy.
			</small>
		</span>
	</label>

	{#if settings.oneHanded}
		<h3 id="hand-label">Which hand?</h3>
		<div class="options" role="radiogroup" aria-labelledby="hand-label">
			{#each hands as h (h.value)}
				<label class="option">
					<input
						type="radio"
						name="hand"
						value={h.value}
						checked={settings.hand === h.value}
						onchange={() => settings.set('hand', h.value)}
					/>
					<span>{h.label}</span>
				</label>
			{/each}
		</div>
	{/if}
</section>

<section>
	<h2>Your data</h2>
	<p>
		Everything this app remembers stays on this device. There is no account, and nothing is
		sent anywhere — which also means nobody else has a copy if this device is lost.
	</p>

	<div class="storage" data-persist={storage.persist}>
		<h3>Is it safe here?</h3>
		{#if storage.persist === 'granted'}
			<p>
				This browser has agreed to keep your data rather than clearing it to reclaim space. A
				backup is still worth having — a granted browser is not a second device.
			</p>
		{:else if storage.persist === 'denied'}
			<!--
				The specific, documented failure: Safari and iOS evict a non-installed site's
				storage after about a week of inactivity, which is exactly the person spaced
				repetition is for.
			-->
			<p class="warn">
				This browser has <strong>not</strong> agreed to keep your data. Some browsers — Safari and
				iOS in particular — delete a site's storage after about a week of not visiting. Installing
				the app to your home screen usually fixes this. Until then, export a backup regularly.
			</p>
		{:else if storage.persist === 'unsupported'}
			<p>
				This browser does not say whether it will keep your data, so treat it as though it will
				not. Export a backup regularly.
			</p>
		{:else}
			<p>Checking…</p>
		{/if}

		<p class="age">
			{#if storage.lastBackup === null}
				No backup taken on this device yet.
			{:else if storage.daysSinceBackup === 0}
				Last backup: today.
			{:else}
				Last backup: {storage.daysSinceBackup}
				{storage.daysSinceBackup === 1 ? 'day' : 'days'} ago.
			{/if}
			{#if storage.overdue}
				<strong>Worth doing now</strong> — anything older than {NUDGE_AFTER_DAYS} days is a month
				of reviews you would be retyping.
			{/if}
		</p>
	</div>

	<h3>Backup and restore</h3>
	<p class="hint">
		The backup is one JSON file holding your flashcard scheduling, quiz history, supervision
		log and development units. It contains no client information, because there is none to
		contain.
	</p>
	<div class="actions">
		<button type="button" class="primary" disabled={storage.busy} onclick={doExport}>
			{storage.busy ? 'Working…' : 'Download a backup'}
		</button>
		<!-- Input first so the focus ring can be drawn on the label that follows it. -->
		<input
			id="{uid}-restore"
			bind:this={fileInput}
			type="file"
			accept="application/json,.json"
			onchange={chooseFile}
		/>
		<label class="filebtn" for="{uid}-restore">Restore from a backup</label>
	</div>

	{#if confirmingImport}
		<div class="confirm" role="alertdialog" aria-labelledby="{uid}-confirm-import">
			<p id="{uid}-confirm-import">
				<strong>Restoring replaces everything on this device.</strong> Your current flashcard scheduling,
				quiz history and logs will be gone. This cannot be undone, so download a backup first if
				you have not.
			</p>
			<div class="actions">
				<button type="button" class="flag" onclick={doImport}>Replace my data</button>
				<button type="button" onclick={() => (confirmingImport = null)}>Cancel</button>
			</div>
		</div>
	{/if}

	{#if storage.message}
		<p class="result" role="status">{storage.message}</p>
	{/if}

	{#if storage.report}
		{@const dropped = storage.report.dropped}
		{#if dropped.length > 0}
			<!-- Never silently: a restore that lost rows must not look like one that did not. -->
			<div class="warn" role="note">
				<p><strong>Some rows could not be restored.</strong></p>
				<ul>
					{#each dropped as d (d.store + d.reason)}
						<li>{d.count} from {d.store} — {d.reason}</li>
					{/each}
				</ul>
			</div>
		{/if}
		{#if storage.report.notesToCheck > 0}
			<p class="warn">
				{storage.report.notesToCheck} restored supervision
				{storage.report.notesToCheck === 1 ? 'note looks' : 'notes look'} like they may carry a name
				or another identifier. Worth reading through and editing.
			</p>
		{/if}
	{/if}

	<h3>Delete everything</h3>
	<p class="hint">
		Removes every flashcard, attempt and log entry stored here. Your settings stay.
	</p>
	{#if confirmingErase}
		<div class="actions">
			<button type="button" class="flag" disabled={storage.busy} onclick={doErase}>
				Yes, delete it all
			</button>
			<button type="button" onclick={() => (confirmingErase = false)}>Cancel</button>
		</div>
	{:else}
		<button type="button" disabled={storage.busy} onclick={() => (confirmingErase = true)}>
			Delete my data
		</button>
	{/if}

	<p class="warn">
		Never type a client's name, date of birth, or any identifying detail into this app.
	</p>
	<p>
		The supervision log is built so that you cannot: there is no name field anywhere in it, and
		a person you supervise is identified by a short code. <a href={resolve('/tools')}
			>The tools</a
		> also export to CSV, which matters because supervision records have to be kept for seven years
		and a browser's storage is not a seven-year home.
	</p>
	<p>
		<a href={resolve('/about')}>About this app, its sources, and how to report an error</a>
	</p>
</section>

<section>
	<h2>Reviewing this app's content</h2>
	<p>
		Every entry here is written first and checked afterwards, and nothing is treated as
		finished until a person who did not write it says so. If that person is you, the review
		queue shows one entry at a time and exports your decisions as a file.
	</p>
	<p>
		<a href={resolve('/review')}>Open the content review queue</a>
	</p>
</section>

<style>
	h3 {
		font-size: 1rem;
		margin-bottom: 0.25rem;
	}
	.hint,
	.age {
		color: var(--text-muted);
		font-size: 0.95rem;
	}
	.storage {
		border: 1px solid var(--border);
		border-left: 4px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
		margin: 0.75rem 0 1.25rem;
		background: var(--surface-raised);
	}
	/* Never colour alone: each state is also stated in a sentence above. */
	.storage[data-persist='granted'] {
		border-left-color: var(--accent);
	}
	.storage[data-persist='denied'],
	.storage[data-persist='unsupported'] {
		border-left-color: var(--caution-border);
	}
	.storage h3 {
		margin-top: 0;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin: 0.5rem 0;
	}
	/*
	 * A file input styled through its own label. The native control is kept in the
	 * accessibility tree and in the tab order rather than hidden with `display: none`,
	 * which would remove it from both.
	 */
	.filebtn {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-weight: 600;
		cursor: pointer;
	}
	input[type='file'] {
		width: 0.1px;
		height: 0.1px;
		opacity: 0;
		position: absolute;
	}
	input[type='file']:focus-visible + .filebtn {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.confirm {
		border: 1px solid var(--stop-border);
		background: var(--stop-bg);
		color: var(--stop-text);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
		margin: 0.5rem 0;
	}
	.result {
		font-weight: 600;
	}
	.warn ul {
		margin: 0.25rem 0 0;
		padding-left: 1.2rem;
	}

	h1 {
		font-size: 1.5rem;
	}

	h2 {
		font-size: 1.05rem;
		margin-top: 2rem;
	}

	h3 {
		font-size: 0.95rem;
		margin-bottom: 0.5rem;
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
	}

	/*
	 * Real radio and checkbox inputs, not div-with-role. Native controls come with
	 * keyboard behaviour, screen-reader semantics and forced-colors support already
	 * correct — reimplementing that is how these controls usually get broken.
	 */
	.option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: var(--tap);
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		cursor: pointer;
	}

	.option:has(input:checked) {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
		font-weight: 600;
	}

	.option:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	.switch {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		cursor: pointer;
		margin-bottom: 0.75rem;
	}

	.switch:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	.switch input {
		margin-top: 0.35rem;
		width: 1.25rem;
		height: 1.25rem;
		flex: none;
	}

	.switch small {
		display: block;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.hint {
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.warn {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius);
	}
</style>
