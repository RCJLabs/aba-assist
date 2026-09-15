/**
 * Applies a reviewer's decisions back into the content files.
 *
 * The review queue in the app (`/review`) stores decisions on the device and exports
 * them as JSON. This is the other half: it takes that export and rewrites the `review:`
 * block of every decided item, so an approval becomes a diff you can read before it
 * becomes a build that ships.
 *
 * Three rules shape the implementation:
 *
 * - **Never reformat what it did not decide.** Editing is line surgery on the `review:`
 *   block only. Folded scalars, comments and key order everywhere else survive
 *   untouched, which is what makes the resulting diff reviewable.
 * - **Never sign an approval as the author.** `Review` refuses `reviewedBy ===
 *   authoredBy` at parse time; this refuses it earlier, before anything is written, and
 *   fails the whole run rather than writing a partial pass.
 * - **Expand anchors when they stop being true.** Question files share one `review: &rev`
 *   block across a whole file by YAML alias. The moment one question in that file is
 *   decided differently from its neighbours the alias is a lie, so every review block in
 *   that file is written out in full.
 *
 * `changeNote` is dropped on approval: its meaning is "what still needs to change", and
 * an approval says nothing does. The CLI prints each note it drops so the information
 * leaves a trace rather than vanishing.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import matter from 'gray-matter';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { discover } from './parse.js';

export type ReviewableKind =
	| 'term'
	| 'scenario'
	| 'question'
	| 'ethics-topic'
	| 'ethics-code'
	| 'practice-guide'
	| 'credential'
	| 'outline';

export interface ReviewDecisionInput {
	id: string;
	kind: ReviewableKind;
	decision: 'approved' | 'needs-change';
	note?: string;
	/**
	 * How the approval was reached. Glossary terms only — every other schema is strict
	 * and has no field for it, so a sampled approval on an escalation card cannot be
	 * written even by a malformed export.
	 */
	method?: 'read' | 'sampled';
	/** The draw that carried a sampled approval. Required with `method: "sampled"`. */
	sampledWith?: string;
}

export interface ApplyReviewInput {
	/** Repo root — the directory that contains `content/`. */
	root: string;
	decisions: ReviewDecisionInput[];
	/** Slug written into `reviewedBy`. */
	reviewer: string;
	/** ISO date written into `reviewedOn`. */
	today: string;
	dryRun?: boolean;
}

export interface AppliedItem {
	id: string;
	kind: ReviewableKind;
	file: string;
	status: 'approved' | 'needs-update';
	/** A `changeNote` the approval removed, so the CLI can report it. */
	droppedNote?: string;
}

export interface ApplyReviewResult {
	ok: boolean;
	applied: AppliedItem[];
	/** Repo-relative paths that changed (or would change, under `dryRun`). */
	files: string[];
	errors: string[];
	/** Files whose shared `review:` anchor had to be written out per question. */
	expandedAnchors: string[];
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_MAX = 280;

/** Where each kind lives, relative to `content/`. */
const COLLECTIONS: Record<ReviewableKind, { dir: string; ext: string }> = {
	term: { dir: 'terms', ext: '.md' },
	scenario: { dir: 'scenarios', ext: '.md' },
	'ethics-topic': { dir: 'ethics/topics', ext: '.md' },
	'ethics-code': { dir: 'ethics/codes', ext: '.yaml' },
	'practice-guide': { dir: 'practice', ext: '.md' },
	credential: { dir: 'credentials', ext: '.yaml' },
	outline: { dir: 'taxonomy', ext: '.yaml' },
	question: { dir: 'questions', ext: '.yaml' }
};

interface ReviewFields {
	status: string;
	authoredBy: string;
	authoredOn: string;
	reviewedBy: string | null;
	reviewedOn: string | null;
	nextReviewDue?: string | null;
	changeNote?: string;
}

interface Located {
	kind: ReviewableKind;
	id: string;
	/** Absolute path. */
	path: string;
	/** Repo-relative path, POSIX separators. */
	file: string;
	review: ReviewFields;
}

function toPosix(p: string): string {
	return p.split(sep).join('/');
}

function asReview(value: unknown): ReviewFields | null {
	if (!value || typeof value !== 'object') return null;
	const r = value as Record<string, unknown>;
	if (typeof r.status !== 'string' || typeof r.authoredBy !== 'string') return null;
	return {
		status: r.status,
		authoredBy: r.authoredBy,
		authoredOn: String(r.authoredOn ?? ''),
		reviewedBy: typeof r.reviewedBy === 'string' ? r.reviewedBy : null,
		reviewedOn: typeof r.reviewedOn === 'string' ? r.reviewedOn : null,
		nextReviewDue: typeof r.nextReviewDue === 'string' ? r.nextReviewDue : null,
		changeNote: typeof r.changeNote === 'string' ? r.changeNote : undefined
	};
}

/**
 * Index every reviewable item by `kind:id`. Reading the tree directly rather than going
 * through the compiler keeps this usable on content the compiler currently rejects —
 * which is exactly the content a reviewer is most likely to be flagging.
 */
export async function indexContent(root: string): Promise<Map<string, Located>> {
	const contentRoot = join(root, 'content');
	const index = new Map<string, Located>();

	for (const [kind, { dir, ext }] of Object.entries(COLLECTIONS) as [
		ReviewableKind,
		{ dir: string; ext: string }
	][]) {
		const paths = await discover(join(contentRoot, ...dir.split('/')), [ext]);
		for (const path of paths) {
			const file = toPosix(relative(root, path));
			const raw = await readFile(path, 'utf8');
			if (ext === '.md') {
				const { data } = matter(raw);
				const d = data as Record<string, unknown>;
				const review = asReview(d.review);
				if (typeof d.id === 'string' && review) {
					index.set(`${kind}:${d.id}`, { kind, id: d.id, path, file, review });
				}
			} else if (kind === 'question') {
				const doc = parseYaml(raw, { maxAliasCount: 2000 }) as {
					questions?: { id?: unknown; review?: unknown }[];
				};
				for (const q of doc?.questions ?? []) {
					const review = asReview(q.review);
					if (typeof q.id === 'string' && review) {
						index.set(`question:${q.id}`, { kind, id: q.id, path, file, review });
					}
				}
			} else {
				const doc = parseYaml(raw, { maxAliasCount: 2000 }) as Record<string, unknown>;
				const review = asReview(doc?.review);
				if (typeof doc?.id === 'string' && review) {
					index.set(`${kind}:${doc.id}`, { kind, id: doc.id, path, file, review });
				}
			}
		}
	}
	return index;
}

/** The review block a decision produces, given what is already on disk. */
export function nextReview(
	current: ReviewFields,
	decision: ReviewDecisionInput,
	reviewer: string,
	today: string
): ReviewFields {
	const base: ReviewFields = {
		status: decision.decision === 'approved' ? 'approved' : 'needs-update',
		authoredBy: current.authoredBy,
		authoredOn: current.authoredOn,
		reviewedBy: reviewer,
		reviewedOn: today,
		nextReviewDue: current.nextReviewDue ?? null
	};
	if (decision.decision === 'needs-change') base.changeNote = (decision.note ?? '').trim();
	return base;
}

function quoteDate(value: string | null | undefined): string {
	return value ? `'${value}'` : 'null';
}

/** Render a review block, including its `review:` header, at the given indent. */
export function renderReview(review: ReviewFields, indent: string): string[] {
	const inner = `${indent}  `;
	const lines = [
		`${indent}review:`,
		`${inner}status: ${review.status}`,
		`${inner}authoredBy: ${review.authoredBy}`,
		`${inner}authoredOn: ${quoteDate(review.authoredOn)}`,
		`${inner}reviewedBy: ${review.reviewedBy ?? 'null'}`,
		`${inner}reviewedOn: ${quoteDate(review.reviewedOn)}`
	];
	if (review.nextReviewDue)
		lines.push(`${inner}nextReviewDue: ${quoteDate(review.nextReviewDue)}`);
	if (review.changeNote) {
		// Let the YAML writer decide on quoting and folding; it knows the escaping rules
		// for a note somebody typed on a phone.
		const rendered = stringifyYaml({ changeNote: review.changeNote }, { lineWidth: 88 })
			.trimEnd()
			.split('\n');
		for (const line of rendered) lines.push(`${inner}${line}`);
	}
	return lines;
}

function indentOf(line: string): number {
	return line.length - line.replace(/^[ \t]*/, '').length;
}

/** Replace the block starting at `start` (its header line) with `next`. */
function spliceBlock(lines: string[], start: number, next: string[]): string[] {
	const base = indentOf(lines[start]!);
	let end = start + 1;
	while (end < lines.length && lines[end]!.trim() !== '' && indentOf(lines[end]!) > base)
		end++;
	return [...lines.slice(0, start), ...next, ...lines.slice(end)];
}

/** Rewrite the single top-level `review:` block of a YAML document or frontmatter. */
export function rewriteSingleReview(text: string, review: ReviewFields): string | null {
	const lines = text.split('\n');
	const start = lines.findIndex((l) => /^review:\s*$/.test(l));
	if (start === -1) return null;
	return spliceBlock(lines, start, renderReview(review, '')).join('\n');
}

/**
 * Set or clear the two top-level keys that record how a term's approval was reached.
 *
 * They sit beside `review:` rather than inside it because the schema keeps them on the
 * glossary alone, and the review block is shared by every kind of content. Clearing means
 * removing the lines entirely rather than writing nulls, so a file that was never
 * approved stays as clean as it was.
 */
export function rewriteMethod(
	text: string,
	method: 'read' | 'sampled' | null,
	sampledWith: string | null
): string {
	const lines = text.split('\n').filter((l) => !/^(reviewMethod|sampledWith):/.test(l));
	if (method === null) return lines.join('\n');

	const added = [`reviewMethod: ${method}`];
	if (sampledWith !== null) added.push(`sampledWith: '${sampledWith.replace(/'/g, "''")}'`);

	// Immediately after the review block, which is where a reader looks for it.
	const start = lines.findIndex((l) => /^review:\s*$/.test(l));
	if (start === -1) return [...lines, ...added].join('\n');
	let end = start + 1;
	while (end < lines.length && (lines[end]!.startsWith(' ') || lines[end]!.trim() === '')) {
		if (lines[end]!.trim() === '') break;
		end++;
	}
	return [...lines.slice(0, end), ...added, ...lines.slice(end)].join('\n');
}

/** Split a markdown file into frontmatter and the rest, without reserialising either. */
function splitFrontmatter(text: string): { front: string; rest: string } | null {
	if (!text.startsWith('---\n')) return null;
	const end = text.indexOf('\n---', 3);
	if (end === -1) return null;
	return { front: text.slice(4, end + 1), rest: text.slice(end + 1) };
}

export function rewriteMarkdown(
	text: string,
	review: ReviewFields,
	method?: { method: 'read' | 'sampled' | null; sampledWith: string | null }
): string | null {
	const split = splitFrontmatter(text);
	if (!split) return null;
	let front = rewriteSingleReview(split.front, review);
	if (front === null) return null;
	if (method) front = rewriteMethod(front, method.method, method.sampledWith);
	return `---\n${front}${split.rest}`;
}

/**
 * Rewrite the per-question review blocks of a question file.
 *
 * Every block in the file is written out in full, not just the decided ones: the file
 * shares one block by anchor, and an anchor that no longer describes every question is
 * worse than no anchor at all.
 */
export function rewriteQuestions(
	text: string,
	reviews: Map<string, ReviewFields>
): { text: string; expanded: boolean; seen: Set<string> } {
	const lines = text.split('\n');
	const out: string[] = [];
	const seen = new Set<string>();
	let expanded = false;
	let current: string | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		// Option ids look the same as question ids in the text; only the ones the parser
		// reported as questions count.
		const id = /^\s*-\s+id:\s*(\S+)\s*$/.exec(line)?.[1];
		if (id && reviews.has(id)) {
			current = id;
			out.push(line);
			continue;
		}
		const header = /^([ \t]+)review:\s*(?:[&*][A-Za-z0-9_-]+\s*)?$/.exec(line);
		if (header && current) {
			const indent = header[1]!;
			const review = reviews.get(current)!;
			seen.add(current);
			if (/[&*]/.test(line)) expanded = true;
			out.push(...renderReview(review, indent));
			while (
				i + 1 < lines.length &&
				lines[i + 1]!.trim() !== '' &&
				indentOf(lines[i + 1]!) > indent.length
			)
				i++;
			continue;
		}
		out.push(line);
	}
	return { text: out.join('\n'), expanded, seen };
}

export async function applyDecisions(input: ApplyReviewInput): Promise<ApplyReviewResult> {
	const errors: string[] = [];
	const applied: AppliedItem[] = [];
	const files: string[] = [];
	const expandedAnchors: string[] = [];

	const reviewer = input.reviewer.trim();
	if (!SLUG.test(reviewer)) {
		errors.push(`Reviewer id "${input.reviewer}" is not a slug (lowercase, digits, hyphens).`);
	}
	if (!ISO_DATE.test(input.today)) {
		errors.push(`Review date "${input.today}" is not an ISO date (YYYY-MM-DD).`);
	}
	if (input.decisions.length === 0) errors.push('No decisions to apply.');
	if (errors.length > 0) return { ok: false, applied, files, errors, expandedAnchors };

	const index = await indexContent(input.root);

	// Resolve and validate everything before writing anything: a half-applied pass is a
	// diff nobody can reason about.
	const resolved: { decision: ReviewDecisionInput; item: Located; next: ReviewFields }[] = [];
	const byId = new Map<string, ReviewDecisionInput>();
	for (const decision of input.decisions) {
		const key = `${decision.kind}:${decision.id}`;
		if (byId.has(key)) {
			errors.push(`Two decisions for ${key}.`);
			continue;
		}
		byId.set(key, decision);
		const item = index.get(key);
		if (!item) {
			errors.push(`No ${decision.kind} with id "${decision.id}" in content/.`);
			continue;
		}
		if (item.review.authoredBy === reviewer) {
			errors.push(
				`${key} was authored by "${reviewer}", who cannot also review it. ` +
					`Approvals are only worth something when somebody else signs them.`
			);
			continue;
		}
		if (decision.method !== undefined && decision.kind !== 'term') {
			errors.push(
				`${key}: a review method is only recorded for glossary terms. Nothing else may be approved by sample.`
			);
		}
		if (decision.method === 'sampled' && !(decision.sampledWith ?? '').trim()) {
			errors.push(`${key}: a sampled approval must name the draw that carried it.`);
		}
		if (decision.method !== 'sampled' && (decision.sampledWith ?? '').trim()) {
			errors.push(`${key}: names a sample but the method is not "sampled".`);
		}
		if (decision.method !== undefined && decision.decision !== 'approved') {
			errors.push(`${key}: a review method only means something on an approval.`);
		}

		const note = (decision.note ?? '').trim();
		if (decision.decision === 'needs-change' && note.length === 0) {
			errors.push(`${key} is flagged but carries no note saying what is wrong.`);
			continue;
		}
		if (note.length > NOTE_MAX) {
			errors.push(`${key} has a ${note.length}-character note; the limit is ${NOTE_MAX}.`);
			continue;
		}
		resolved.push({
			decision,
			item,
			next: nextReview(item.review, decision, reviewer, input.today)
		});
	}
	if (errors.length > 0) return { ok: false, applied, files, errors, expandedAnchors };

	// Group by file, because a question file is rewritten as a whole.
	const groups = new Map<string, typeof resolved>();
	for (const entry of resolved) {
		const list = groups.get(entry.item.path) ?? [];
		list.push(entry);
		groups.set(entry.item.path, list);
	}

	for (const [path, entries] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
		const first = entries[0]!;
		const text = await readFile(path, 'utf8');
		let updated: string | null;

		if (first.item.kind === 'question') {
			// Every question in the file, decided or not, with the decided ones overridden.
			const reviews = new Map<string, ReviewFields>();
			for (const [key, located] of index) {
				if (located.path === path && key.startsWith('question:')) {
					reviews.set(located.id, located.review);
				}
			}
			for (const entry of entries) reviews.set(entry.item.id, entry.next);
			const result = rewriteQuestions(text, reviews);
			const missing = entries.filter((e) => !result.seen.has(e.item.id));
			if (missing.length > 0) {
				errors.push(
					`${first.item.file}: could not find the review block for ${missing
						.map((m) => m.item.id)
						.join(', ')}.`
				);
				continue;
			}
			if (result.expanded) expandedAnchors.push(first.item.file);
			updated = result.text;
		} else if (COLLECTIONS[first.item.kind].ext === '.md') {
			// Only the glossary carries a review method; everything else has no field for it.
			const method =
				first.item.kind === 'term'
					? first.decision.decision === 'approved'
						? {
								method: (first.decision.method ?? 'read') as 'read' | 'sampled',
								sampledWith: first.decision.sampledWith ?? null
							}
						: { method: null, sampledWith: null }
					: undefined;
			updated = rewriteMarkdown(text, first.next, method);
		} else {
			updated = rewriteSingleReview(text, first.next);
		}

		if (updated === null) {
			errors.push(`${first.item.file}: no top-level "review:" block to rewrite.`);
			continue;
		}
		if (updated !== text) {
			files.push(first.item.file);
			if (!input.dryRun) await writeFile(path, updated, 'utf8');
		}
		for (const entry of entries) {
			applied.push({
				id: entry.item.id,
				kind: entry.item.kind,
				file: entry.item.file,
				status: entry.next.status as 'approved' | 'needs-update',
				...(entry.decision.decision === 'approved' && entry.item.review.changeNote
					? { droppedNote: entry.item.review.changeNote }
					: {})
			});
		}
	}

	return { ok: errors.length === 0, applied, files, errors, expandedAnchors };
}

/** Parse and validate the JSON the review page exports. */
export function parseExport(raw: string): {
	reviewer: string;
	decisions: ReviewDecisionInput[];
	errors: string[];
} {
	const errors: string[] = [];
	let doc: unknown;
	try {
		doc = JSON.parse(raw);
	} catch (e) {
		return {
			reviewer: '',
			decisions: [],
			errors: [`Not valid JSON: ${(e as Error).message}`]
		};
	}
	const d = doc as { reviewer?: unknown; decisions?: unknown };
	const reviewer = typeof d?.reviewer === 'string' ? d.reviewer : '';
	if (!reviewer) errors.push('The export has no "reviewer".');
	const decisions: ReviewDecisionInput[] = [];
	if (!Array.isArray(d?.decisions)) {
		errors.push('The export has no "decisions" array.');
	} else {
		for (const [i, entry] of d.decisions.entries()) {
			const e = entry as Record<string, unknown>;
			const kind = e?.kind;
			if (typeof e?.id !== 'string' || typeof kind !== 'string' || !(kind in COLLECTIONS)) {
				errors.push(`decisions[${i}] has no usable id/kind.`);
				continue;
			}
			if (e.decision !== 'approved' && e.decision !== 'needs-change') {
				errors.push(`decisions[${i}] has decision "${String(e.decision)}".`);
				continue;
			}
			if (e.method !== undefined && e.method !== 'read' && e.method !== 'sampled') {
				errors.push(`decisions[${i}] has method "${String(e.method)}".`);
				continue;
			}
			decisions.push({
				id: e.id,
				kind: kind as ReviewableKind,
				decision: e.decision,
				...(e.method === undefined ? {} : { method: e.method }),
				...(typeof e.sampledWith === 'string' ? { sampledWith: e.sampledWith } : {}),
				note: typeof e.note === 'string' ? e.note : ''
			});
		}
	}
	return { reviewer, decisions, errors };
}
