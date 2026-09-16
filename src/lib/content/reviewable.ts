import { resolve } from '$app/paths';
import type { ReviewableKind } from '$lib/db/index.js';
import {
	CATEGORIES,
	loadQuestions,
	loadTermBucket,
	outlines,
	questionCredentials
} from './load.js';
import {
	credentials,
	ethicsCodes,
	ethicsTopicList,
	graphList,
	practiceGuideList
} from './corpus.js';
import { scenarios } from './scenarios.js';

/**
 * Re-exported so a component can name the kind without importing the database layer,
 * which the lint rule forbids for good reason: `$state` proxies must be snapshotted
 * before they reach IndexedDB, and that is the state layer's job.
 */
export type { ReviewableKind };

/** One labelled block of an item, rendered as-is for the reviewer to judge. */
export interface ReviewField {
	label: string;
	lines: string[];
}

export interface ReviewItem {
	id: string;
	kind: ReviewableKind;
	title: string;
	subtitle: string;
	/** The status recorded in the content file, so a reviewer can see what is already done. */
	status: string;
	/**
	 * Term category, and null for every other kind.
	 *
	 * Carried explicitly rather than parsed back out of `subtitle`, because the tiering
	 * and the sampling both key off it and a display string is not an interface.
	 */
	category: string | null;
	/**
	 * Which release-gate requirement this item belongs to, if any.
	 *
	 * Carried rather than derived from `kind`, because the gate requires escalation cards
	 * complete and not every scenario. Null for the growable kinds, which are withheld
	 * individually rather than blocking a release.
	 */
	gate: string | null;
	/** Where to read it as a reader would. Null for items with no page of their own. */
	href: string | null;
	fields: ReviewField[];
	citations: string[];
	/** The author's own account of what they wrote it from. */
	consulted: string;
	/**
	 * How many other entries in the corpus point at this one. Terms only; null elsewhere.
	 *
	 * The glossary has a floor to clear before a release, and 150 of 259 is a choice
	 * somebody has to make. This is the number that makes it for them: a term the
	 * questions, situations and task lists keep citing is one a reader will arrive at,
	 * and a term nothing cites can ship later without anybody noticing it was missing.
	 * Counted rather than tagged, so it stays true as the corpus grows.
	 */
	inboundRefs: number | null;
}

const list = (xs: readonly string[]) => xs.filter(Boolean);

/**
 * Everything in the build that carries a review status, flattened into one queue.
 *
 * Loaded on demand rather than at startup: this pulls every category bucket and both
 * question banks, which is the whole corpus. Nobody but a reviewer needs that, and a
 * reviewer is not in a hurry to open one page.
 */
export async function loadReviewItems(): Promise<ReviewItem[]> {
	const items: ReviewItem[] = [];

	/*
	 * Inbound references, accumulated as the corpus is walked and attached to the term
	 * items at the end. Counting here rather than in a second pass avoids loading every
	 * category bucket and both question banks twice, which is the expensive half of this
	 * function.
	 */
	const inbound = new Map<string, number>();
	const cite = (refs: readonly string[]) => {
		for (const r of refs) inbound.set(r, (inbound.get(r) ?? 0) + 1);
	};

	// ------------------------------------------------------------------ terms
	for (const category of CATEGORIES) {
		const bucket = await loadTermBucket(category);
		for (const t of Object.values(bucket)) {
			cite(t.seeAlso);
			cite(t.contrastWith);
			items.push({
				id: t.id,
				kind: 'term',
				gate: null,
				title: t.term,
				subtitle: `${category}${t.aliases.length ? ` · also: ${t.aliases.join(', ')}` : ''}`,
				status: t.review.status,
				category,
				href: resolve('/glossary/[slug]', { slug: t.id }),
				fields: [
					{ label: 'Technical definition', lines: [t.definition.technical] },
					{ label: 'Plain language', lines: [t.definition.plain] },
					{ label: 'One-line gloss', lines: [t.definition.gloss] },
					{ label: 'Examples', lines: t.examples.map((e) => e.text) },
					{ label: 'Non-examples', lines: t.nonExamples.map((e) => e.text) },
					{
						label: 'Cross-references',
						lines: list([
							t.contrastWith.length ? `Confused with: ${t.contrastWith.join(', ')}` : '',
							t.seeAlso.length ? `See also: ${t.seeAlso.join(', ')}` : '',
							t.taskRefs.length
								? `Exam tasks: ${t.taskRefs.map((r) => `${r.credential} ${r.code}`).join(', ')}`
								: ''
						])
					}
				],
				citations: t.citations.map((c) => c.sourceId + (c.locator ? ` — ${c.locator}` : '')),
				consulted: t.attestation.consulted,
				inboundRefs: 0
			});
		}
	}

	// -------------------------------------------------------------- scenarios
	for (const s of scenarios) {
		cite(s.termRefs);
		const fields: ReviewField[] = [{ label: 'The situation', lines: [s.situation] }];
		if (s.kind === 'guidance') {
			fields.push(
				{
					label: 'Steps',
					lines: s.steps.map((x) => x.text + (x.rationale ? ` — ${x.rationale}` : ''))
				},
				{ label: 'What not to do', lines: [...s.whatNotToDo] },
				{ label: 'When to escalate', lines: [...s.whenToEscalate] }
			);
		} else {
			fields.push(
				{ label: 'Risk flags', lines: [s.riskFlags.join(', ')] },
				{ label: 'Contacts', lines: [s.escalation.contacts.join(', ')] },
				{ label: 'Right now', lines: [s.escalation.immediateSafetyNote] },
				{
					label: 'Mandated reporting',
					lines: list([s.escalation.mandatedReporterNote ?? ''])
				},
				{ label: 'Documentation', lines: [...s.escalation.documentation] },
				{ label: 'Legal note', lines: [s.escalation.legalNote] }
			);
		}
		items.push({
			id: s.id,
			kind: 'scenario',
			title: s.title,
			subtitle: s.kind === 'guidance' ? 'Everyday situation' : 'Stop and escalate',
			status: s.review.status,
			category: null,
			gate: s.kind === 'guidance' ? null : 'escalation',
			href: resolve('/scenarios/[slug]', { slug: s.id }),
			fields,
			citations: s.citations.map((c) => c.sourceId + (c.locator ? ` — ${c.locator}` : '')),
			consulted: s.attestation.consulted,
			inboundRefs: null
		});
	}

	// -------------------------------------------------------------- questions
	for (const credential of questionCredentials) {
		for (const q of await loadQuestions(credential)) {
			cite(q.termRefs);
			items.push({
				id: q.id,
				kind: 'question',
				gate: null,
				title: q.stem,
				subtitle: `${q.credential} ${q.taskRef.code} · ${q.cognitiveLevel} · difficulty ${q.difficulty}`,
				status: q.review.status,
				category: null,
				href: null,
				fields: [
					{
						label: 'Options',
						lines: q.options.map(
							(o) =>
								`${o.id.toUpperCase()}. ${o.isCorrect ? '[CORRECT] ' : ''}${o.text}\n     ${o.rationale}`
						)
					},
					{ label: 'Explanation', lines: [q.explanation] },
					{
						label: 'Links',
						lines: list([
							q.termRefs.length ? `Terms: ${q.termRefs.join(', ')}` : '',
							q.negated ? 'Flagged as a negated stem' : ''
						])
					}
				],
				citations: q.citations.map((c) => c.sourceId + (c.locator ? ` — ${c.locator}` : '')),
				consulted: q.attestation.consulted,
				inboundRefs: null
			});
		}
	}

	// ----------------------------------------------------------- ethics topics
	for (const t of ethicsTopicList) {
		cite(t.termRefs);
		items.push({
			id: t.id,
			kind: 'ethics-topic',
			gate: null,
			title: t.ourLabel,
			subtitle: `${t.appliesTo.join(', ')} · ${t.gloss}`,
			status: t.review.status,
			category: null,
			href: resolve('/ethics/[slug]', { slug: t.id }),
			fields: [
				{ label: 'What the obligation is', lines: [t.ourSummary] },
				{ label: 'Plain language', lines: [t.plainSummary] },
				{ label: 'What this looks like', lines: [...t.whatThisLooksLike] },
				{ label: 'Where people get caught', lines: [...t.commonPitfalls] },
				{ label: 'If you are not sure', lines: [t.ifYouAreUnsure] },
				{
					label: 'Placed under',
					lines: t.sectionRefs.map((r) => `${r.codeId} section ${r.section}`)
				}
			],
			citations: t.citations.map((c) => c.sourceId + (c.locator ? ` — ${c.locator}` : '')),
			consulted: t.attestation.consulted,
			inboundRefs: null
		});
	}

	// ---------------------------------------------------------- practice guides
	for (const g of practiceGuideList) {
		cite(g.termRefs);
		items.push({
			id: g.id,
			kind: 'practice-guide',
			gate: null,
			title: g.title,
			subtitle: `${g.audience.join(', ')} · ${g.gloss}`,
			status: g.review.status,
			category: null,
			href: resolve('/tools/notes'),
			fields: [
				{ label: 'What it says', lines: [g.ourSummary] },
				{ label: 'Plain language', lines: [g.plainSummary] },
				{ label: 'Who actually decides', lines: [g.whoDecides] },
				g.kind === 'checklist'
					? {
							label: 'Elements',
							lines: g.items.map(
								(i) => `${i.label} — ${i.why}${i.example ? ` (e.g. ${i.example})` : ''}`
							)
						}
					: {
							label: 'Pairs',
							lines: g.pairs.map((p) => `${p.vague} → ${p.objective} — ${p.why}`)
						}
			],
			citations: g.citations.map((c) => c.sourceId + (c.locator ? ` — ${c.locator}` : '')),
			consulted: g.attestation.consulted,
			inboundRefs: null
		});
	}

	// ------------------------------------------------------------------ graphs
	for (const g of graphList) {
		cite(g.termRefs);
		items.push({
			id: g.id,
			kind: 'graph',
			gate: null,
			title: g.title,
			subtitle: `${g.design} · ${g.gloss}`,
			status: g.review.status,
			category: null,
			href: resolve('/graphs/[slug]', { slug: g.id }),
			fields: [
				{ label: 'Why it matters', lines: [g.teaching] },
				{ label: 'Plain language', lines: [g.plainSummary] },
				// The text alternative is reviewed as content, not checked off as metadata:
				// it is what a reader using a screen reader gets instead of the picture.
				{ label: 'Described as', lines: [g.longDescription] },
				{
					label: 'Conditions',
					lines: g.phases.map(
						(p) =>
							`${p.label} (${p.from}–${p.to}${p.seriesId ? `, ${p.seriesId}` : ''})${p.changeNote ? ` — ${p.changeNote}` : ''}`
					)
				},
				{
					label: 'Data',
					lines: g.series.map((s) => `${s.label}: ${s.points.map((pt) => pt.y).join(', ')}`)
				},
				{
					label: 'What to see in it',
					lines: g.readings.map((r) => `${r.feature}: ${r.text}`)
				},
				...(g.callouts.length > 0
					? [{ label: 'Parts', lines: g.callouts.map((c) => `${c.label} — ${c.text}`) }]
					: [])
			],
			citations: g.citations.map((c) => c.sourceId + (c.locator ? ` — ${c.locator}` : '')),
			consulted: g.attestation.consulted,
			inboundRefs: null
		});
	}

	// ------------------------------------------------------------ ethics codes
	for (const c of Object.values(ethicsCodes)) {
		items.push({
			id: c.id,
			kind: 'ethics-code',
			gate: 'ethics-code',
			title: c.shortName,
			subtitle: `Effective ${c.effectiveDate} · ${c.appliesTo.join(', ')}`,
			status: c.review.status,
			category: null,
			href: resolve('/ethics'),
			fields: [
				{ label: 'Overview', lines: [c.ourOverview] },
				{
					label: 'Core principles',
					lines: c.corePrinciples.map(
						(p) => `${p.ourLabel} — ${p.ourSummary} (${p.sourceNote})`
					)
				},
				{
					label: 'Sections',
					lines: c.sections.map((s) => `${s.number}. ${s.ourLabel} — ${s.ourSummary}`)
				},
				{
					label: 'Verification',
					lines: [
						`Standard numbers verified: ${c.standardsVerified ? 'yes' : 'no'}`,
						c.totalStandards
							? `Total standards: ${c.totalStandards}`
							: 'Total standards: not stated'
					]
				}
			],
			citations: [c.sourceId],
			consulted: c.review.changeNote ?? '',
			inboundRefs: null
		});
	}

	// ------------------------------------------------------------- credentials
	for (const c of Object.values(credentials)) {
		items.push({
			id: c.id,
			kind: 'credential',
			gate: 'credential',
			title: `${c.credential} requirements`,
			subtitle: `From the ${c.handbookVersion} handbook`,
			status: c.review.status,
			category: null,
			href: c.outlineId ? resolve('/exams/[id]', { id: c.outlineId }) : null,
			fields: [
				{ label: 'Overview', lines: [c.ourOverview] },
				...c.sections.map((s) => ({
					label: s.title,
					lines: s.items.map(
						(i) => `${i.label}: ${i.value}${i.locator ? ` (${i.locator})` : ''}`
					)
				}))
			],
			citations: [c.handbookSourceId],
			consulted: c.review.changeNote ?? '',
			inboundRefs: null
		});
	}

	// ---------------------------------------------------------------- outlines
	for (const o of Object.values(outlines)) {
		for (const d of o.domains) for (const t of d.tasks) cite(t.termRefs);
		items.push({
			id: o.id,
			kind: 'outline',
			gate: 'outline',
			title: `${o.credential} Test Content Outline (${o.edition} ed.)`,
			subtitle: `Effective ${o.effectiveDate} · ${o.domains.length} domains · ${o.totalTasks} tasks`,
			status: o.review.status,
			category: null,
			href: resolve('/exams/[id]', { id: o.id }),
			fields: [
				{
					label: 'Verification',
					lines: [
						`Task codes verified: ${o.countsVerified ? 'yes' : 'no'}`,
						`Exam: ${o.exam.scoredItems ?? '?'} scored, ${o.exam.unscoredItems ?? '?'} unscored, ${o.exam.minutes ?? '?'} minutes`
					]
				},
				...o.domains.map((d) => ({
					label: `${d.letter}. ${d.name} — ${d.examWeightPercent}%, ${d.examItems} questions`,
					lines: [d.ourDescription, ...d.tasks.map((t) => `${t.code} — ${t.ourSummary}`)]
				}))
			],
			citations: [o.sourceId],
			consulted: o.review.changeNote ?? '',
			inboundRefs: null
		});
	}

	/*
	 * Attached last because the counts are only complete once everything that can cite a
	 * term has been walked, and the terms were built first.
	 */
	for (const item of items) {
		if (item.kind === 'term') item.inboundRefs = inbound.get(item.id) ?? 0;
	}

	return items;
}

export const KIND_LABELS: Record<ReviewableKind, string> = {
	term: 'Glossary terms',
	scenario: 'Situations',
	question: 'Practice questions',
	'ethics-topic': 'Ethics topics',
	'ethics-code': 'Ethics codes',
	'practice-guide': 'Practice guides',
	graph: 'Graphs',
	credential: 'Credential requirements',
	outline: 'Exam outlines'
};
