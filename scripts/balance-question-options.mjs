#!/usr/bin/env node
/**
 * Spread the correct answer across the option positions in the question source files.
 *
 * The quiz shuffles option order on every run, so a reader never sees a positional bias.
 * The files are a different audience: a reviewer reading six hundred questions where the
 * correct answer is always listed first reads them as confirmations rather than as
 * questions, and the distractors — which are where the pedagogy in this bank actually
 * lives — stop getting evaluated. It also means any future consumer of this content that
 * does not shuffle ships a trivially gameable bank.
 *
 * The permutation is derived from the question id, so this is idempotent: running it
 * twice produces the same file, and a question's options do not move when its neighbours
 * change. That matters because the alternative — a random shuffle — would rewrite every
 * question on every run and make the diff useless.
 *
 * Text manipulation rather than a YAML round-trip, deliberately: these files carry
 * anchors (`&att`, `*att`) and hand-wrapped block scalars that a load-and-dump would
 * destroy, producing a diff nobody could review.
 *
 * Usage: node scripts/balance-question-options.mjs [--check]
 *   --check exits non-zero if any file would change, and writes nothing.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('../content/questions/', import.meta.url).pathname;
const CHECK = process.argv.includes('--check');

async function* walk(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(path);
		else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) yield path;
	}
}

const LETTERS = 'abcde';

/** Where this question's correct option should sit. Stable for a given id. */
function targetIndex(id, count) {
	const digest = createHash('sha256').update(id).digest();
	return digest.readUInt32BE(0) % count;
}

/**
 * Rewrite one `options:` block.
 *
 * `entries` are the option bodies in file order — every line of each option except its
 * own `- id:` line, which is reissued in sequence so the ids stay a, b, c, d.
 */
function reorder(entries, id) {
	const correct = entries.findIndex((e) => e.some((l) => /^\s+isCorrect:\s*true\s*$/.test(l)));
	// Multi-select, or a malformed block: rotate rather than positioning one answer.
	const from = correct === -1 ? 0 : correct;
	const to = targetIndex(id, entries.length);
	const shift = (from - to + entries.length) % entries.length;
	return entries.map((_, i) => entries[(i + shift) % entries.length]);
}

function rewrite(text) {
	const lines = text.split('\n');
	const out = [];
	let id = null;
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];
		const idMatch = /^ {2}- id:\s*(\S+)\s*$/.exec(line);
		if (idMatch) id = idMatch[1];

		if (line !== '    options:') {
			out.push(line);
			i++;
			continue;
		}

		out.push(line);
		i++;

		// Collect the option entries: each starts at "      - id: x" and runs to the
		// next one, or to the first line that is outside the block.
		const entries = [];
		let body = null;
		while (i < lines.length) {
			const l = lines[i];
			if (/^ {6}- id:\s*\S+\s*$/.test(l)) {
				body = [];
				entries.push(body);
				i++;
				continue;
			}
			// Anything indented deeper than the option marker belongs to the current option.
			if (body !== null && (l.startsWith('        ') || l.trim() === '')) {
				body.push(l);
				i++;
				continue;
			}
			break;
		}

		const ordered = reorder(entries, id ?? '');
		ordered.forEach((entryBody, index) => {
			out.push(`      - id: ${LETTERS[index]}`);
			out.push(...entryBody);
		});
	}

	return out.join('\n');
}

let changed = 0;
let seen = 0;
for await (const path of walk(ROOT)) {
	const before = await readFile(path, 'utf8');
	const after = rewrite(before);
	seen++;
	if (before === after) continue;
	changed++;
	if (!CHECK) await writeFile(path, after);
	console.log(`${CHECK ? 'would rewrite' : 'rewrote'} ${path.slice(ROOT.length)}`);
}

console.log(`${seen} file(s) scanned, ${changed} ${CHECK ? 'would change' : 'changed'}`);
if (CHECK && changed > 0) process.exit(1);
