import { resolve } from '$app/paths';
import type { ReviewableKind } from '$lib/db/index.js';
import {
	CATEGORIES,
	credentials,
	ethicsCodes,
	ethicsTopicList,
	loadQuestions,
	loadTermBucket,
	outlines,
	questionCredentials
} from './load.js';
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
	/** Where to read it as a reader would. Null for items with no page of their own. */
	href: string | null;
	fields: ReviewField[];
	citations: string[];
	/** The author's own account of what they wrote it from. */
	consulted: string;
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

	// ------------------------------------------------------------------ terms
	for (const category of CATEGORIES) {
		const bucket = await loadTermBucket(category);
		for (const t of Object.values(bucket)) {
			items.push({
				id: t.id,
				kind: 'term',
				title: t.term,
				subtitle: `${category}${t.aliases.length ? ` · also: ${t.aliases.join(', ')}` : ''}`,
				status: t.review.status,
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
				consulted: t.attestation.consulted
			});
		}
	}

	// -------------------------------------------------------------- scenarios
	for (const s of scenarios) {
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
			href: resolve('/scenarios/[slug]', { slug: s.id }),
			fields,
			citations: s.citations.map((c) => c.sourceId + (c.locator ? ` — ${c.locator}` : '')),
			consulted: s.attestation.consulted
		});
	}

	// -------------------------------------------------------------- questions
	for (const credential of questionCredentials) {
		for (const q of await loadQuestions(credential)) {
			items.push({
				id: q.id,
				kind: 'question',
				title: q.stem,
				subtitle: `${q.credential} ${q.taskRef.code} · ${q.cognitiveLevel} · difficulty ${q.difficulty}`,
				status: q.review.status,
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
				consulted: q.attestation.consulted
			});
		}
	}

	// ----------------------------------------------------------- ethics topics
	for (const t of ethicsTopicList) {
		items.push({
			id: t.id,
			kind: 'ethics-topic',
			title: t.ourLabel,
			subtitle: `${t.appliesTo.join(', ')} · ${t.gloss}`,
			status: t.review.status,
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
			consulted: t.attestation.consulted
		});
	}

	// ------------------------------------------------------------ ethics codes
	for (const c of Object.values(ethicsCodes)) {
		items.push({
			id: c.id,
			kind: 'ethics-code',
			title: c.shortName,
			subtitle: `Effective ${c.effectiveDate} · ${c.appliesTo.join(', ')}`,
			status: c.review.status,
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
			consulted: c.review.changeNote ?? ''
		});
	}

	// ------------------------------------------------------------- credentials
	for (const c of Object.values(credentials)) {
		items.push({
			id: c.id,
			kind: 'credential',
			title: `${c.credential} requirements`,
			subtitle: `From the ${c.handbookVersion} handbook`,
			status: c.review.status,
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
			consulted: c.review.changeNote ?? ''
		});
	}

	// ---------------------------------------------------------------- outlines
	for (const o of Object.values(outlines)) {
		items.push({
			id: o.id,
			kind: 'outline',
			title: `${o.credential} Test Content Outline (${o.edition} ed.)`,
			subtitle: `Effective ${o.effectiveDate} · ${o.domains.length} domains · ${o.totalTasks} tasks`,
			status: o.review.status,
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
			consulted: o.review.changeNote ?? ''
		});
	}

	return items;
}

export const KIND_LABELS: Record<ReviewableKind, string> = {
	term: 'Glossary terms',
	scenario: 'Situations',
	question: 'Practice questions',
	'ethics-topic': 'Ethics topics',
	'ethics-code': 'Ethics codes',
	credential: 'Credential requirements',
	outline: 'Exam outlines'
};
