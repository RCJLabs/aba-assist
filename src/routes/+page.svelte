<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { onMount } from 'svelte';
	import { base, resolve } from '$app/paths';
	import { SITE_ORIGIN } from '$lib/config.js';
	import { webSite } from '$lib/seo/meta.js';
	import ContentFilters from '$lib/components/ContentFilters.svelte';
	import {
		termIndex,
		CATEGORY_LABELS,
		contentVersion,
		outlineForCredential,
		outlines
	} from '$lib/content/load.js';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { filters, type CredentialFilter } from '$lib/state/filters.svelte.js';
	import { rememberTrackerRole } from '$lib/state/mode.js';
	import { search, type SearchHit } from '$lib/state/search.svelte.js';
	import { EMPTY, loadStrip, type HomeStrip } from '$lib/home/strip.js';
	import ExamDial from '$lib/components/ExamDial.svelte';
	import FigureRows from '$lib/components/FigureRows.svelte';
	import { examDates } from '$lib/state/examDate.svelte.js';
	import { daysUntil, domainCoverage, type CoverageDomain } from '$lib/study/coverage.js';

	// Search results respect the same exam/domain/category filter as the glossary, so
	// someone studying for one exam never sees content that is not on it.
	const results = $derived(search.results.filter((r) => filters.matchesHit(r)));

	/**
	 * Where a hit goes.
	 *
	 * Route ids resolved here rather than paths stored in the index: the base path differs
	 * between an origin root and a project site, and a href built by hand is exactly what
	 * breaks when it changes. A practice guide and an exam task are sections of a page
	 * rather than pages, so they get a fragment.
	 */
	function hrefFor(r: SearchHit): string {
		switch (r.kind) {
			case 'scenario':
				return resolve('/scenarios/[slug]', { slug: r.id });
			case 'ethics-topic':
				return resolve('/ethics/[slug]', { slug: r.id });
			case 'practice-guide':
				return resolve('/tools/notes');
			case 'graph':
				return resolve('/graphs/[slug]', { slug: r.id });
			case 'task':
				return r.parent ? resolve('/exams/[id]', { id: r.parent }) : resolve('/exams');
			default:
				return resolve('/glossary/[slug]', { slug: r.id });
		}
	}

	let lastAnnounced = -1;
	$effect(() => {
		const n = results.length;
		const q = search.query.trim();
		if (q.length < 2) {
			lastAnnounced = -1;
			return;
		}
		if (n === lastAnnounced) return;
		lastAnnounced = n;
		// Debounced by the reader's own typing rather than a timer: announcing on every
		// keystroke would make a screen reader unusable, so this only speaks when the
		// count actually changes.
		announcer.announce(`${n} ${n === 1 ? 'result' : 'results'} for ${q}`);
	});

	/**
	 * The mode, and what it actually does.
	 *
	 * This is the shared content filter promoted to the front of the app rather than a new
	 * idea: picking one here is what the glossary, search, flashcards, the quiz and the
	 * plan all follow. It also points the tracker at the same credential, because a mode
	 * that leaves /tools checking somebody else's requirements is decoration.
	 */
	const MODES: { value: CredentialFilter; code: string; role: string; full: string }[] = [
		{ value: 'RBT', code: 'RBT', role: 'Technician', full: 'Technician (RBT)' },
		{
			value: 'BCaBA',
			code: 'BCaBA',
			role: 'Assistant',
			full: 'Assistant behavior analyst (BCaBA)'
		},
		{ value: 'BCBA', code: 'BCBA', role: 'Analyst', full: 'Behavior analyst (BCBA)' },
		{ value: 'all', code: 'All', role: 'No filter', full: 'Everything, with no filter' }
	];

	function setMode(value: CredentialFilter) {
		filters.set({ credential: value });
		rememberTrackerRole(value);
		void refreshStrip();
		announcer.announce(
			value === 'all'
				? 'Showing everything'
				: `Showing ${MODES.find((m) => m.value === value)?.full ?? value} content`
		);
	}

	const isTechnician = $derived(filters.credential === 'RBT');
	const isAnalyst = $derived(filters.credential === 'BCBA' || filters.credential === 'BCaBA');

	/*
	 * The personal strip, loaded after the page is already complete.
	 *
	 * Deliberately not part of the first render: a home page that waits on IndexedDB is a
	 * blank page for a first-time visitor and for a search engine, and this page is the
	 * app's main way of reaching people.
	 */
	let strip = $state<HomeStrip>(EMPTY);
	/*
	 * Whether storage has answered yet.
	 *
	 * Not shown to anybody — the point of the deferred load is that the page is already
	 * complete without it. It exists because "the figures are still loading" and "there
	 * are no figures to show" render identically, and without a way to tell them apart a
	 * test can only race a timeout. Same reasoning as `data-search-status` on the search
	 * form and `data-attempt` on the quiz results.
	 */
	let stripStatus = $state<'loading' | 'ready'>('loading');

	async function refreshStrip() {
		const credential = filters.refCredential ?? 'RBT';
		const outline = outlineForCredential(credential);
		strip = await loadStrip(
			credential,
			(outline?.domains ?? []).map((d) => ({
				letter: d.letter,
				name: d.name,
				examWeightPercent: d.examWeightPercent,
				examItems: d.examItems,
				tasks: d.tasks.map((t) => ({ code: t.code }))
			})),
			filters.refCredential !== null
		);
		stripStatus = 'ready';
	}

	onMount(() => {
		// Before the root layout mounts, so the strip is built for the chosen mode
		// rather than for the default.
		filters.hydrate();
		examDates.hydrate();
		void refreshStrip();
	});

	/*
	 * The dial.
	 *
	 * The ring's shape comes from the compiled outline, so it is drawn correctly on the
	 * very first paint with every arc empty — the exam's shape is a fact about the exam,
	 * not about the reader. Storage then fills the arcs in. That ordering is the same one
	 * the rest of this page follows, and it is why a first-time visitor sees a complete
	 * map of the paper rather than a spinner.
	 *
	 * It is shown only when a credential has been chosen. In "All" mode nobody has said
	 * which exam they are sitting, and quietly drawing the technician's outline would be
	 * answering a question that was not asked.
	 */
	const dialCredential = $derived(filters.refCredential);

	const dialDomains = $derived.by((): CoverageDomain[] => {
		if (!dialCredential) return [];
		if (strip.coverage.length > 0) return strip.coverage;
		const outline = outlineForCredential(dialCredential);
		return domainCoverage(
			(outline?.domains ?? []).map((d) => ({
				letter: d.letter,
				name: d.name,
				examWeightPercent: d.examWeightPercent,
				tasks: d.tasks.map((t) => ({ code: t.code }))
			})),
			new Set()
		);
	});

	const examDate = $derived(dialCredential ? examDates.get(dialCredential) : null);
	const days = $derived(examDate ? daysUntil(examDate, Date.now()) : null);

	function onExamDate(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		if (!dialCredential) return;
		if (value) examDates.set(dialCredential, value);
		else examDates.clear(dialCredential);
	}

	/** Long form, for the summary line and for anything reading it aloud. */
	const examDateLabel = $derived.by(() => {
		if (!examDate) return null;
		const [y, m, d] = examDate.split('-').map(Number);
		return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	});

	const outlineList = Object.values(outlines);
	/*
	 * Counts from the compiled manifest rather than from the corpora.
	 *
	 * Importing `scenarios` and `graphList` to render two numbers pulled every situation,
	 * every graph and everything they transitively reach into the bundle the home page
	 * loads — half a megabyte of script to say "36". The build already counts these.
	 */
	const counts = contentVersion.counts;
	const questionCount = counts.questions ?? 0;
	const scenarioCount = counts.scenarios ?? 0;
	const graphCount = counts.graphs ?? 0;

	// Stated once, for the description tag and the site's own structured data.
	const DESCRIPTION =
		'A free, offline reference and study tool for behavior technicians, analysts, and paraeducators. Plain-language definitions with sources, flashcards, practice questions, and situational guidance.';
</script>

<Seo
	title="ABA Assist — offline reference and study tool for behavior technicians and analysts"
	description={DESCRIPTION}
	structured={webSite({ origin: SITE_ORIGIN, base, description: DESCRIPTION })}
/>

<h1 class="visually-hidden">ABA Assist</h1>

<!--
	The mode leads, because it changes what everything else means. Radios rather than
	toggle buttons: it is a single persistent choice, and a radio group gives arrow-key
	navigation and the right announcement for free.
-->
<fieldset class="modes">
	<legend>Show content for</legend>
	<div class="chips">
		{#each MODES as m (m.value)}
			<label class="chip" class:active={filters.credential === m.value}>
				<input
					type="radio"
					name="mode"
					value={m.value}
					checked={filters.credential === m.value}
					onchange={() => setMode(m.value)}
					aria-label={m.full}
				/>
				<span class="chip-label">{m.code}</span>
				<span class="chip-note">{m.role}</span>
			</label>
		{/each}
	</div>
</fieldset>

<!--
	`data-search-status` reflects which tier is answering: `idle`/`loading` means the
	instant substring fallback, `ready` means the fuzzy index has taken over. It is not
	shown to readers — swapping results silently is the point — but it makes the handover
	observable, so tests can wait for it deterministically instead of racing a timeout.
-->
<form role="search" data-search-status={search.status} onsubmit={(e) => e.preventDefault()}>
	<label for="q">Search terms</label>
	<input
		id="q"
		type="search"
		bind:value={search.query}
		placeholder="reinforcement, MO, partial interval…"
		autocomplete="off"
		enterkeyhint="search"
		onfocus={() => search.warm()}
		oninput={() => search.warm()}
	/>
</form>

<details class="filter-box" open={filters.domain !== 'all' || filters.category !== 'all'}>
	<summary>
		Narrow it further{#if filters.domain !== 'all' || filters.category !== 'all'}:
			{filters.describe() || 'category'}{/if}
	</summary>
	<!-- The exam select is hidden here: the mode above already owns that choice. -->
	<ContentFilters label="Narrow search results" showCredential={false} />
</details>

{#if search.query.trim().length >= 2}
	<!--
		Answers, above results.

		Deliberately not merged into the ranked list and deliberately not filtered by the
		exam or category drop-downs: somebody typing what is happening in front of them is
		not browsing a corpus, and a card that exactly answers them must not be displaced by
		a term whose gloss happens to share a word — or hidden because the filter is still
		set to Behavior Acquisition from ten minutes ago.
	-->
	{#if search.routes.length > 0}
		<section
			class="routes"
			aria-labelledby="routes-heading"
			data-routes={search.routes.length}
		>
			<h2 id="routes-heading">
				{search.routes.length === 1
					? 'This may be what you mean'
					: 'These may be what you mean'}
			</h2>
			<ul>
				{#each search.routes as r (r.id)}
					<li data-escalate={r.escalate}>
						<a href={resolve('/scenarios/[slug]', { slug: r.id })}>
							<span class="title">{r.title}</span>
							{#if r.escalate}
								<span class="flag">Stop and escalate</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<p class="count">{results.length} {results.length === 1 ? 'result' : 'results'}</p>
	{#if results.length > 0}
		<ul class="results">
			{#each results as r (r.kind + ':' + r.id)}
				<li>
					<!-- Resolved above; the linter cannot see through the helper. -->
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={hrefFor(r)}>
						<span class="term">
							{r.title}
							<span class="kind" data-kind={r.kind}>{r.label}</span>
						</span>
						<span class="gloss">{r.gloss}</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p>
			Nothing matched{#if filters.active}
				with the current filter{/if}. This build has {termIndex.length} terms, {scenarioCount}
			situations and the ethics reference.
			<a href="{resolve('/about')}#errata">Tell us what is missing.</a>
		</p>
	{/if}
{:else}
	<!--
		The crisis affordance stays first. It was above the old strip and it stays above the
		dial: nothing on this page outranks knowing who to call.
	-->
	<a class="tile stop" href={resolve('/help')}>
		<strong>Something urgent is happening</strong>
		<span>Who to contact, and what to write down.</span>
	</a>

	{#if dialCredential}
		<!--
			The dial. Drawn from the outline on the first paint, filled in from storage a
			moment later — so a first-time visitor and a search engine both get a complete
			map of the exam rather than a spinner.
		-->
		<section class="cockpit" aria-labelledby="cockpit-h" data-strip={stripStatus}>
			<h2 id="cockpit-h">Where you are on the {dialCredential} outline</h2>

			<ExamDial credential={dialCredential} domains={dialDomains} {days} />

			<p class="caption">
				Each arc is one content area, sized by what it is worth on the exam and filled by how
				many of its tasks you have been asked about. A full ring means you have covered every
				area once — it is a map, not a prediction.
			</p>

			<details class="when">
				<summary>
					{#if examDateLabel}
						Exam on {examDateLabel} — change
					{:else}
						Add your exam date
					{/if}
				</summary>
				<div class="when-body">
					<label for="exam-date">Date of your {dialCredential} exam</label>
					<input id="exam-date" type="date" value={examDate ?? ''} onchange={onExamDate} />
					<p class="when-note">
						Kept on this device, and used for the countdown only. Clearing the field removes
						it.
					</p>
				</div>
			</details>

			{#if strip.rows.length > 0}
				<FigureRows rows={strip.rows} label="Where you stand" />
			{/if}
		</section>
	{:else}
		<!--
			No exam chosen yet — and "Everything" is the default, so most people arrive here
			rather than choosing it. Drawing the technician's ring anyway would be inventing
			an exam nobody named, so this points at the control that names one instead. It is
			one sentence, and it makes the dial discoverable without presuming.
		-->
		<section class="cockpit pick" aria-labelledby="pick-h" data-strip={stripStatus}>
			<h2 id="pick-h">Studying for an exam?</h2>
			<p class="caption">
				Pick RBT, BCaBA or BCBA above. This is where you will see how much of that exam's
				outline you have covered — area by area, each one sized by how much of the paper it is
				worth.
			</p>
			<!--
				The figures stay either way. The month's supervision and the development cycle
				are about a credential already held rather than about an exam being studied
				for, so they are still worth saying to somebody who has not named a paper.
			-->
			{#if strip.rows.length > 0}
				<FigureRows rows={strip.rows} label="Where you stand" />
			{/if}
		</section>
	{/if}

	<h2>Look something up</h2>
	<nav aria-label="Reference" class="tiles">
		<a class="tile" href={resolve('/glossary')}>
			<strong>Glossary</strong>
			<span>{termIndex.length} terms, plain language and technical.</span>
		</a>
		<a class="tile" href={resolve('/scenarios')}>
			<strong>Situations</strong>
			<span
				>{scenarioCount} situations: what the literature says, and when to ask your supervisor.</span
			>
		</a>
		<a class="tile" href={resolve('/ethics')}>
			<strong>Ethics</strong>
			<span>Both codes in plain language: what each obligation means in practice.</span>
		</a>
		<a class="tile" href={resolve('/abbreviations')}>
			<strong>Abbreviations</strong>
			<span>What MO, SD, DRO and the rest stand for, in one list.</span>
		</a>
	</nav>

	<h2>Study for the exam</h2>
	<nav aria-label="Study" class="tiles">
		<a class="tile" href={resolve('/competency')}>
			<strong>Competency assessment</strong>
			<span>The nineteen tasks you have to demonstrate, and what each one asks.</span>
		</a>
		<a class="tile" href={resolve('/drills')}>
			<strong>Calculation drills</strong>
			<span>Rate, percentage and the agreement methods, on fresh numbers every time.</span>
		</a>
		<a class="tile" href={resolve('/drills/pairs')}>
			<strong>Commonly confused</strong>
			<span>One situation, two names it could have. Where most marks actually go.</span>
		</a>
		<a class="tile" href={resolve('/drills/data')}>
			<strong>Taking data</strong>
			<span>Record a session as it happens, then see what your data missed.</span>
		</a>
		<a class="tile" href={resolve('/drills/graph')}>
			<strong>Drawing a graph</strong>
			<span>Put a data sheet on paper: the points, the blank, and the phase line.</span>
		</a>
		<a class="tile" href={resolve('/plan')}>
			<strong>What to study next</strong>
			<span>Your practice history, read as a plan rather than a score.</span>
		</a>
		<a class="tile" href={resolve('/progress')}>
			<strong>How it is going</strong>
			<span>Your scores over time, and whether the flashcards are sticking.</span>
		</a>
		<a class="tile" href={resolve('/study')}>
			<strong>Flashcards</strong>
			<span>Spaced repetition over any set of terms. Works offline.</span>
		</a>
		<a class="tile" href={resolve('/quiz')}>
			<strong>Practice questions</strong>
			<span>{questionCount} original questions with a rationale for every option.</span>
		</a>
		<a class="tile" href={resolve('/graphs')}>
			<strong>Reading graphs</strong>
			<span
				>{graphCount} worked graphs: level, trend, variability and what a design shows.</span
			>
		</a>
		<a class="tile" href={resolve('/exams')}>
			<strong>Exam outlines</strong>
			<span
				>{outlineList.map((o) => o.credential).join(' and ')}: domains, weights, tasks,
				requirements.</span
			>
		</a>
	</nav>

	<h2>On the job</h2>
	<nav aria-label="On the job" class="tiles">
		<a class="tile" href={resolve('/session')}>
			<strong>Session mode</strong>
			<span>The interval cue, the note checklist and a lookup, on one screen.</span>
		</a>
		<a class="tile" href={resolve('/tools')}>
			<strong>Supervision and development</strong>
			<span>
				{#if isAnalyst}
					Record the supervision you give, and your own CEUs.
				{:else if isTechnician}
					Log your contacts and PDUs against the real monthly requirement.
				{:else}
					Log contacts and units against the real requirements.
				{/if}
				No client data, ever.
			</span>
		</a>
		{#if isAnalyst}
			<a class="tile" href={resolve('/tools/fieldwork')}>
				<strong>Fieldwork hours</strong>
				<span>Checked a calendar month at a time, because that is how it is verified.</span>
			</a>
		{/if}
		<a class="tile" href={resolve('/tools/notes')}>
			<strong>Writing session notes</strong>
			<span>What a note has to carry, and saying it so somebody could have counted it.</span>
		</a>
		<a class="tile" href={resolve('/tools/timer')}>
			<strong>Interval timer</strong>
			<span>Partial, whole and momentary sampling, with a running percentage.</span>
		</a>
	</nav>

	<h2>Browse by area</h2>
	<ul class="cats">
		{#each [...new Set(termIndex.map((t) => t.c))].sort() as c (c)}
			<li><a href="{resolve('/glossary')}#{c}">{CATEGORY_LABELS[c] ?? c}</a></li>
		{/each}
	</ul>
{/if}

<p class="version">
	Content version {contentVersion.contentVersion} · aligned to the RBT Test Content Outline (3rd
	ed., effective 1 January 2026) and the BCBA Test Content Outline (6th ed., effective 1 January
	2025)
</p>

<style>
	/* The mode leads the page, so it is compact: search must stay above the fold. */
	.modes {
		border: 0;
		padding: 0;
		margin: 0 0 0.75rem;
	}
	.modes legend {
		font-weight: 600;
		font-size: 0.9rem;
		padding: 0;
		margin-bottom: 0.3rem;
	}
	/* One row of four at 320px: the mode leads the page, so it must not push search down. */
	.chips {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.4rem;
	}
	.chip {
		position: relative;
		display: grid;
		justify-items: center;
		align-content: center;
		text-align: center;
		padding: 0.3rem 0.2rem;
		min-height: var(--tap);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		cursor: pointer;
	}
	/*
	 * The radio is stretched over the whole chip rather than hidden at 1px: it is the
	 * control, so it has to be the target, and a 1px control fails 2.5.8 even when the
	 * label beside it is comfortably large.
	 */
	.chip input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.chip:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.chip.active {
		border-color: var(--accent);
		border-width: 2px;
		padding: calc(0.3rem - 1px) calc(0.2rem - 1px);
	}
	.chip-label {
		font-weight: 700;
		font-size: 0.95rem;
		line-height: 1.2;
	}
	.chip-note {
		font-size: 0.7rem;
		color: var(--text-muted);
		/* Four chips have to stay one row at 320px; a wrapped note makes them uneven. */
		white-space: nowrap;
	}
	/* Never colour alone: the selected chip is also the only one announced as checked. */

	/*
	 * The cockpit: the dial, what it means, the exam date, and the two things worth
	 * doing about it. One card, so it reads as one answer to "where am I".
	 */
	.cockpit {
		margin: 1rem 0;
		padding: 1rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
	}

	.cockpit h2 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
		text-align: center;
		color: var(--text-muted);
		font-weight: 600;
	}

	.pick .caption {
		margin-top: 0;
	}

	.caption {
		margin: 0.75rem auto 0;
		max-width: 34rem;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.when {
		margin-top: 0.75rem;
		font-size: 0.9rem;
	}

	.when summary {
		display: flex;
		align-items: center;
		min-height: var(--tap);
		cursor: pointer;
		color: var(--link);
	}

	.when-body {
		display: grid;
		gap: 0.3rem;
		padding-top: 0.25rem;
	}

	.when-body label {
		font-weight: 600;
		font-size: 0.9rem;
	}

	.when-body input {
		/* The same box as every other control in the app, and never wider than its column. */
		width: 100%;
		max-width: 100%;
		min-width: 0;
		min-height: var(--tap);
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		color: var(--text);
		font: inherit;
	}

	.when-note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	h1 {
		font-size: 1.5rem;
	}

	label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	input[type='search'] {
		width: 100%;
		padding: 0.75rem;
		font-size: 1.1rem;
		border: 2px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		color: var(--text);
	}

	.filter-box {
		margin: 0.5rem 0 1rem;
		font-size: 0.95rem;
	}

	.filter-box summary {
		display: flex;
		align-items: center;
		min-height: var(--tap);
		cursor: pointer;
		color: var(--link);
	}

	.count {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.kind {
		display: inline-block;
		margin-left: 0.5rem;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		vertical-align: middle;
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.05rem 0.45rem;
		color: var(--text-muted);
	}
	/* Never colour alone: the badge is a word first. */
	.kind[data-kind='scenario'],
	.kind[data-kind='ethics-topic'] {
		border-color: var(--accent);
		color: var(--accent);
	}

	/*
		Marked as the urgent thing by the band tokens the rest of the app uses for this, with
		the words "Stop and escalate" carrying it as well as the colour — the same rule
		everywhere else: never colour alone for anything that means act differently.
	*/
	.routes {
		margin: 1rem 0;
		padding: 0.75rem 0.9rem;
		border: 2px solid var(--band-urgent-edge);
		border-radius: var(--radius);
		background: var(--surface-raised);
	}

	.routes h2 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
	}

	.routes ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}

	.routes li a {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		min-height: var(--tap);
		padding: 0.35rem 0;
		font-weight: 600;
	}

	.routes .flag {
		flex: none;
		padding: 0.05rem 0.4rem;
		border-radius: 4px;
		background: var(--band-urgent-bg);
		color: var(--band-urgent-text);
		font-size: 0.78em;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.results,
	.cats,
	.tiles {
		list-style: none;
		padding: 0;
	}

	.results li {
		border-bottom: 1px solid var(--border);
	}

	.results a {
		display: block;
		padding: 0.75rem 0.25rem;
		min-height: var(--tap);
		text-decoration: none;
		color: var(--text);
	}

	.term {
		display: block;
		font-weight: 600;
		color: var(--link);
	}

	.gloss {
		display: block;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.tiles {
		display: grid;
		gap: 0.75rem;
		margin: 1.5rem 0;
	}

	@media (min-width: 36rem) {
		.tiles {
			grid-template-columns: 1fr 1fr;
		}
		.tile.stop {
			grid-column: 1 / -1;
		}
	}

	.tile {
		display: block;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		text-decoration: none;
		color: var(--text);
	}

	.tile strong {
		display: block;
		color: var(--link);
	}

	.tile span {
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.tile.stop {
		background: var(--stop-bg);
		border-color: var(--stop-border);
	}

	.tile.stop strong,
	.tile.stop span {
		color: var(--stop-text);
	}

	/*
	 * The list items are flex containers, not blocks holding an inline-flex anchor.
	 * With inline-level anchors the 44px chips overflow their line boxes and overlap the
	 * neighbouring row, which axe correctly reports as a partially obscured target
	 * (WCAG 2.2 2.5.8) even though the chips themselves are large enough.
	 *
	 * The gap is >= 24px so the target-offset check passes too: adjacent targets need a
	 * 24px clickable diameter between their centres.
	 */
	.cats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
	}

	.cats li {
		display: flex;
	}

	.cats a {
		display: flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		text-decoration: none;
	}

	.version {
		margin-top: 2rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
</style>
