<script lang="ts">
	import { resolve } from '$app/paths';
	import { settings, type Theme, type Hand } from '$lib/state/settings.svelte.js';
	import { announcer } from '$lib/state/announcer.svelte.js';

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
		sent anywhere. Clearing your browser's data for this site removes it.
	</p>
	<p class="warn">
		Never type a client's name, date of birth, or any identifying detail into this app.
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
