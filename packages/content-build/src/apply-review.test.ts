import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { applyDecisions, parseExport, renderReview } from './apply-review.js';

/**
 * These fixtures are written as real YAML — folded scalars, shared anchors, comments —
 * rather than as JSON, because the whole point of this module is that it edits such
 * files without disturbing the parts it was not asked to change. A fixture that is
 * already flat would prove nothing.
 */

const TERM = `---
id: sample-term
term: Sample Term
category: principles
definition:
  technical: >-
    A precise statement of the concept, folded across two lines so that the test can
    prove the fold survives an approval.
  plain: A short and easy way to say the same thing.
  gloss: A short summary line
review:
  status: in-review
  authoredBy: claude
  authoredOn: '2026-09-14'
  reviewedBy: null
  reviewedOn: null
provenance:
  license: CC-BY-SA-4.0
  updated: '2026-09-14'
---

Body text, which must not move.
`;

const OUTLINE = `# A comment at the top of the file.
id: sample-outline
credential: RBT

review:
  status: in-review
  authoredBy: claude
  authoredOn: '2026-09-14'
  reviewedBy: null
  reviewedOn: null
  changeNote: >-
    Counts read from the outline document; awaiting an independent check.

provenance:
  license: CC-BY-SA-4.0
  updated: '2026-09-14'
`;

const QUESTIONS = `questions:
  - id: q-one
    stem: The first question.
    review: &rev
      status: in-review
      authoredBy: claude
      authoredOn: '2026-09-14'
      reviewedBy: null
      reviewedOn: null
    options:
      - id: a
        text: An option whose id must not be mistaken for a question id.
        isCorrect: true

  - id: q-two
    stem: The second question.
    review: *rev
    options:
      - id: a
        text: Another option.
        isCorrect: true

  - id: q-three
    stem: The third question.
    review: *rev
    options:
      - id: a
        text: A third option.
        isCorrect: true
`;

async function fixture(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'aba-apply-'));
	await mkdir(join(root, 'content/terms/principles'), { recursive: true });
	await mkdir(join(root, 'content/taxonomy'), { recursive: true });
	await mkdir(join(root, 'content/questions/rbt'), { recursive: true });
	await writeFile(join(root, 'content/terms/principles/sample-term.md'), TERM);
	await writeFile(join(root, 'content/taxonomy/sample-outline.yaml'), OUTLINE);
	await writeFile(join(root, 'content/questions/rbt/sample.yaml'), QUESTIONS);
	return root;
}

const base = { reviewer: 'evan', today: '2026-09-20' };

describe('applyDecisions', () => {
	it('writes an approval into a markdown term without touching anything else', async () => {
		const root = await fixture();
		const result = await applyDecisions({
			root,
			...base,
			decisions: [{ id: 'sample-term', kind: 'term', decision: 'approved' }]
		});

		expect(result.ok).toBe(true);
		expect(result.files).toEqual(['content/terms/principles/sample-term.md']);

		const text = await readFile(join(root, 'content/terms/principles/sample-term.md'), 'utf8');
		expect(text).toContain('status: approved');
		expect(text).toContain('reviewedBy: evan');
		expect(text).toContain("reviewedOn: '2026-09-20'");
		// Everything else is byte-identical.
		expect(text).toContain('  technical: >-\n');
		expect(text).toContain('prove the fold survives an approval.');
		expect(text.endsWith('Body text, which must not move.\n')).toBe(true);
	});

	it('records a flag as needs-update with the reviewer note', async () => {
		const root = await fixture();
		const result = await applyDecisions({
			root,
			...base,
			decisions: [
				{
					id: 'sample-term',
					kind: 'term',
					decision: 'needs-change',
					note: 'The example is wrong.'
				}
			]
		});

		expect(result.ok).toBe(true);
		const text = await readFile(join(root, 'content/terms/principles/sample-term.md'), 'utf8');
		expect(text).toContain('status: needs-update');
		expect(text).toContain('changeNote: The example is wrong.');
	});

	it('refuses an approval signed by the author, and writes nothing', async () => {
		const root = await fixture();
		const before = await readFile(
			join(root, 'content/terms/principles/sample-term.md'),
			'utf8'
		);
		const result = await applyDecisions({
			root,
			reviewer: 'claude',
			today: '2026-09-20',
			decisions: [{ id: 'sample-term', kind: 'term', decision: 'approved' }]
		});

		expect(result.ok).toBe(false);
		expect(result.errors.join(' ')).toMatch(/cannot also review/);
		expect(await readFile(join(root, 'content/terms/principles/sample-term.md'), 'utf8')).toBe(
			before
		);
	});

	it('refuses a flag with no note', async () => {
		const root = await fixture();
		const result = await applyDecisions({
			root,
			...base,
			decisions: [{ id: 'sample-term', kind: 'term', decision: 'needs-change', note: '   ' }]
		});
		expect(result.ok).toBe(false);
		expect(result.errors.join(' ')).toMatch(/no note/);
	});

	it('refuses an id that is not in the content tree, without applying its siblings', async () => {
		const root = await fixture();
		const before = await readFile(
			join(root, 'content/terms/principles/sample-term.md'),
			'utf8'
		);
		const result = await applyDecisions({
			root,
			...base,
			decisions: [
				{ id: 'sample-term', kind: 'term', decision: 'approved' },
				{ id: 'no-such-term', kind: 'term', decision: 'approved' }
			]
		});

		expect(result.ok).toBe(false);
		expect(result.errors.join(' ')).toMatch(/no-such-term/);
		expect(await readFile(join(root, 'content/terms/principles/sample-term.md'), 'utf8')).toBe(
			before
		);
	});

	it('drops a changeNote on approval and reports it', async () => {
		const root = await fixture();
		const result = await applyDecisions({
			root,
			...base,
			decisions: [{ id: 'sample-outline', kind: 'outline', decision: 'approved' }]
		});

		expect(result.ok).toBe(true);
		expect(result.applied[0]?.droppedNote).toMatch(/awaiting an independent check/);
		const text = await readFile(join(root, 'content/taxonomy/sample-outline.yaml'), 'utf8');
		expect(text).not.toContain('changeNote');
		expect(text).toContain('# A comment at the top of the file.');
		expect(text).toContain('status: approved');
	});

	it('expands the shared review anchor when one question in the file is decided', async () => {
		const root = await fixture();
		const result = await applyDecisions({
			root,
			...base,
			decisions: [{ id: 'q-two', kind: 'question', decision: 'approved' }]
		});

		expect(result.ok).toBe(true);
		expect(result.expandedAnchors).toEqual(['content/questions/rbt/sample.yaml']);

		const text = await readFile(join(root, 'content/questions/rbt/sample.yaml'), 'utf8');
		expect(text).not.toContain('&rev');
		expect(text).not.toContain('*rev');

		const doc = parseYaml(text) as {
			questions: { id: string; review: Record<string, unknown> }[];
		};
		expect(doc.questions.map((q) => q.id)).toEqual(['q-one', 'q-two', 'q-three']);
		expect(doc.questions[1]?.review).toMatchObject({
			status: 'approved',
			reviewedBy: 'evan',
			reviewedOn: '2026-09-20'
		});
		// The neighbours keep the status they had; only the anchor went away.
		expect(doc.questions[0]?.review).toMatchObject({ status: 'in-review', reviewedBy: null });
		expect(doc.questions[2]?.review).toMatchObject({ status: 'in-review', reviewedBy: null });
		// The option ids were never mistaken for question ids.
		expect(text).toContain('An option whose id must not be mistaken for a question id.');
	});

	it('leaves the tree alone under --dry-run', async () => {
		const root = await fixture();
		const before = await readFile(
			join(root, 'content/terms/principles/sample-term.md'),
			'utf8'
		);
		const result = await applyDecisions({
			root,
			...base,
			dryRun: true,
			decisions: [{ id: 'sample-term', kind: 'term', decision: 'approved' }]
		});

		expect(result.ok).toBe(true);
		expect(result.files).toEqual(['content/terms/principles/sample-term.md']);
		expect(await readFile(join(root, 'content/terms/principles/sample-term.md'), 'utf8')).toBe(
			before
		);
	});

	it('rejects a reviewer id that is not a slug', async () => {
		const root = await fixture();
		const result = await applyDecisions({
			root,
			reviewer: 'Evan Cook',
			today: '2026-09-20',
			decisions: [{ id: 'sample-term', kind: 'term', decision: 'approved' }]
		});
		expect(result.ok).toBe(false);
		expect(result.errors.join(' ')).toMatch(/not a slug/);
	});

	it('rejects a note longer than the schema allows', async () => {
		const root = await fixture();
		const result = await applyDecisions({
			root,
			...base,
			decisions: [
				{ id: 'sample-term', kind: 'term', decision: 'needs-change', note: 'x'.repeat(281) }
			]
		});
		expect(result.ok).toBe(false);
		expect(result.errors.join(' ')).toMatch(/limit is 280/);
	});
});

describe('renderReview', () => {
	it('quotes a note that would otherwise be read as YAML structure', () => {
		const lines = renderReview(
			{
				status: 'needs-update',
				authoredBy: 'claude',
				authoredOn: '2026-09-14',
				reviewedBy: 'evan',
				reviewedOn: '2026-09-20',
				changeNote: 'Fix this: the colon makes it a mapping'
			},
			'    '
		);
		const parsed = parseYaml(lines.join('\n')) as { review: { changeNote: string } };
		expect(parsed.review.changeNote).toBe('Fix this: the colon makes it a mapping');
	});
});

describe('parseExport', () => {
	it('reads the payload the review page produces', () => {
		const parsed = parseExport(
			JSON.stringify({
				reviewer: 'evan',
				exportedAt: '2026-09-20T00:00:00.000Z',
				decisions: [{ id: 'sample-term', kind: 'term', decision: 'approved', note: '' }]
			})
		);
		expect(parsed.errors).toEqual([]);
		expect(parsed.reviewer).toBe('evan');
		expect(parsed.decisions).toHaveLength(1);
	});

	it('rejects a payload with an unknown kind or a missing reviewer', () => {
		const parsed = parseExport(
			JSON.stringify({ decisions: [{ id: 'x', kind: 'sandwich', decision: 'approved' }] })
		);
		expect(parsed.errors.join(' ')).toMatch(/reviewer/);
		expect(parsed.errors.join(' ')).toMatch(/usable id\/kind/);
	});

	it('rejects text that is not JSON', () => {
		expect(parseExport('not json').errors.join(' ')).toMatch(/Not valid JSON/);
	});
});

describe('how an approval was reached', () => {
	/*
	 * The glossary is the only thing that may be carried by a sample, and a file that was
	 * carried has to say so. An approval that hides its own basis is worth less than one
	 * that states it, and the whole point of tiering the review is lost if the record
	 * cannot tell the two apart afterwards.
	 */

	it('writes the method into a term that was read', async () => {
		const root = await fixture();
		const result = await applyDecisions({
			root,
			reviewer: 'evan',
			today: '2026-09-15',
			decisions: [{ id: 'sample-term', kind: 'term', decision: 'approved', method: 'read' }]
		});
		expect(result.errors).toEqual([]);
		const text = await readFile(join(root, 'content/terms/principles/sample-term.md'), 'utf8');
		expect(text).toContain('reviewMethod: read');
		expect(text).not.toContain('sampledWith:');
	});

	it('writes the draw into a term that a sample carried', async () => {
		const root = await fixture();
		const result = await applyDecisions({
			root,
			reviewer: 'evan',
			today: '2026-09-15',
			decisions: [
				{
					id: 'sample-term',
					kind: 'term',
					decision: 'approved',
					method: 'sampled',
					sampledWith: 'term:principles@abc123:10-of-40'
				}
			]
		});
		expect(result.errors).toEqual([]);
		const text = await readFile(join(root, 'content/terms/principles/sample-term.md'), 'utf8');
		expect(text).toContain('reviewMethod: sampled');
		expect(text).toContain("sampledWith: 'term:principles@abc123:10-of-40'");
	});

	it('REFUSES to record a sampled approval on anything but a glossary term', async () => {
		const root = await fixture();
		const result = await applyDecisions({
			root,
			reviewer: 'evan',
			today: '2026-09-15',
			decisions: [
				{
					id: 'sample-outline',
					kind: 'outline',
					decision: 'approved',
					method: 'sampled',
					sampledWith: 'x'
				}
			]
		});
		expect(result.errors.join(' ')).toMatch(/only recorded for glossary terms/);
	});

	it('REFUSES a sampled approval that does not name its draw', async () => {
		const root = await fixture();
		const result = await applyDecisions({
			root,
			reviewer: 'evan',
			today: '2026-09-15',
			decisions: [{ id: 'sample-term', kind: 'term', decision: 'approved', method: 'sampled' }]
		});
		expect(result.errors.join(' ')).toMatch(/must name the draw/);
	});

	it('clears the method when a term goes back to needing a change', async () => {
		const root = await fixture();
		await applyDecisions({
			root,
			reviewer: 'evan',
			today: '2026-09-15',
			decisions: [{ id: 'sample-term', kind: 'term', decision: 'approved', method: 'read' }]
		});
		await applyDecisions({
			root,
			reviewer: 'evan',
			today: '2026-09-16',
			decisions: [
				{
					id: 'sample-term',
					kind: 'term',
					decision: 'needs-change',
					note: 'The gloss is wrong.'
				}
			]
		});
		const text = await readFile(join(root, 'content/terms/principles/sample-term.md'), 'utf8');
		expect(text).not.toContain('reviewMethod:');
	});
});
