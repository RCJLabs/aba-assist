/**
 * Check the machine-readable facts against the documents they came from.
 *
 * The app's numbers — task codes, domain names, exam weights, ethics standard numbers —
 * are facts, and facts can be checked by a machine rather than by a person reading a
 * hundred items in an evening. This does that: it extracts the text of the source PDFs
 * and compares it against what `content/` claims.
 *
 * The PDFs are not in the repository and must not be. They belong to the rights-holder,
 * and this project links rather than hosts. So the path is supplied at run time, the
 * script reads them where they sit, and nothing it reads is written anywhere.
 *
 *   node scripts/verify-against-sources.mjs --sources=/path/to/pdfs
 *
 * A mismatch is not automatically a wrong entry: outlines get reissued, and the document
 * on disk may be newer or older than the one the content was written from. It is a thing
 * that needs a person to look at, which is the point — it turns hundreds of assertions
 * into the handful that disagree.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const sources = arg('sources');
if (!sources) {
	console.error('Usage: node scripts/verify-against-sources.mjs --sources=/path/to/pdfs');
	process.exit(2);
}

/** Text of the first file in `sources` whose name matches, or null. */
function text(pattern) {
	const file = readdirSync(sources).find((f) => pattern.test(f));
	if (!file) return null;
	return execFileSync('pdftotext', ['-layout', join(sources, file), '-'], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	});
}

const G = 'src/lib/content/generated';
const load = (f) => JSON.parse(readFileSync(join(G, f), 'utf8'));

let checked = 0;
let failed = 0;

function ok(label) {
	checked++;
	return `  PASS  ${label}`;
}
function bad(label, expected, found) {
	checked++;
	failed++;
	return `  FAIL  ${label}\n          content says:  ${expected}\n          document says: ${found}`;
}

// ------------------------------------------------------------------ outlines

const OUTLINE_DOCS = [
	{ credential: 'RBT', pattern: /RBT-3rd-Edition-Test-Content-Outline/i },
	{ credential: 'BCBA', pattern: /BCBA-6th-Edition-Test-Content-Outline/i },
	{ credential: 'BCaBA', pattern: /BCaBA-6th-Edition-Test-Content-Outline/i }
];

const taxonomy = load('taxonomy.json');

for (const doc of OUTLINE_DOCS) {
	const outline = Object.values(taxonomy).find((o) => o.credential === doc.credential);
	if (!outline) continue;
	const raw = text(doc.pattern);
	if (!raw) {
		console.log(`\n${doc.credential} outline — no document supplied, skipped`);
		continue;
	}
	// Collapse whitespace runs: the layout extractor pads columns heavily.
	const flat = raw.replace(/\s+/g, ' ');
	console.log(`\n${doc.credential} Test Content Outline`);

	/*
	 * Every task code we model must appear in the document.
	 *
	 * The outlines print a code as "A.1." with a trailing period, so the boundary after it
	 * is a period or a space — never `\s` alone. Requiring a space here passed the RBT
	 * outline by luck and reported all 104 BCBA codes missing, which is the shape of a
	 * broken check rather than broken content: a real transcription error loses one code,
	 * not every code.
	 *
	 * The trailing class also keeps A.1 from matching inside A.10.
	 */
	const codes = outline.domains.flatMap((d) => d.tasks.map((t) => t.code));
	const missing = codes.filter(
		(c) => !new RegExp(`\\b${c.replace('.', '\\.')}[.\\s]`).test(flat)
	);
	console.log(
		missing.length === 0
			? ok(`all ${codes.length} task codes appear in the document`)
			: bad('task codes', `${codes.length} codes`, `missing: ${missing.join(', ')}`)
	);

	// Domain names are factual labels, so they should match the document exactly.
	for (const d of outline.domains) {
		console.log(
			flat.includes(d.name)
				? ok(`domain ${d.letter} name "${d.name}"`)
				: bad(`domain ${d.letter} name`, d.name, 'not found in the document')
		);
	}

	// Exam weights, which the outlines print as "13 (17%)".
	const allPairs = [...flat.matchAll(/(\d+)\s*\((\d+)%\)/g)].map((m) => m[0]);
	for (const d of outline.domains) {
		if (d.examWeightPercent === null || d.examItems === null) continue;
		const pair = new RegExp(`${d.examItems}\\s*\\(${d.examWeightPercent}%\\)`);
		console.log(
			pair.test(flat)
				? ok(`domain ${d.letter} weight ${d.examItems} (${d.examWeightPercent}%)`)
				: bad(
						`domain ${d.letter} weight`,
						`${d.examItems} (${d.examWeightPercent}%)`,
						`pairs in document: ${allPairs.slice(0, 12).join(', ') || 'none found'}`
					)
		);
	}

	if (outline.exam.scoredItems !== null) {
		const re = new RegExp(`${outline.exam.scoredItems}\\s+scored`, 'i');
		console.log(
			re.test(flat)
				? ok(`${outline.exam.scoredItems} scored questions`)
				: bad('scored items', String(outline.exam.scoredItems), 'phrase not found')
		);
	}
	if (outline.totalTasks !== null) {
		const re = new RegExp(`${outline.totalTasks}\\s+tasks`, 'i');
		console.log(
			re.test(flat)
				? ok(`${outline.totalTasks} tasks`)
				: bad('total tasks', String(outline.totalTasks), 'phrase not found')
		);
	}
}

// -------------------------------------------------------------- ethics codes

const CODE_DOCS = [
	{
		id: 'ethics-code-for-behavior-analysts-2022',
		pattern: /Ethics-Code-for-Behavior-Analysts/i
	},
	{ id: 'rbt-ethics-code-2-0', pattern: /RBT-Ethics-Code/i }
];

const codes = load('ethics-codes.json');

for (const doc of CODE_DOCS) {
	const code = codes[doc.id];
	if (!code) continue;
	const raw = text(doc.pattern);
	if (!raw) {
		console.log(`\n${doc.id} — no document supplied, skipped`);
		continue;
	}
	const flat = raw.replace(/\s+/g, ' ');
	console.log(`\n${doc.id}`);

	const numbers = code.sections.flatMap((s) => (s.standards ?? []).map((t) => t.number));
	const gone = numbers.filter((n) => !new RegExp(`\\b${n.replace('.', '\\.')}\\b`).test(flat));
	console.log(
		gone.length === 0
			? ok(`all ${numbers.length} standard numbers appear in the document`)
			: bad('standard numbers', `${numbers.length} standards`, `missing: ${gone.join(', ')}`)
	);

	// Contiguous numbering within a section catches a standard dropped in transcription.
	for (const s of code.sections) {
		const ours = (s.standards ?? []).map((t) => Number(t.number.split('.')[1]));
		const gaps = ours.filter((n, i) => i > 0 && n !== ours[i - 1] + 1);
		console.log(
			gaps.length === 0
				? ok(`section ${s.number} numbering is contiguous (${ours.length} standards)`)
				: bad(`section ${s.number} numbering`, 'contiguous', `jumps before ${gaps.join(', ')}`)
		);
	}
}

console.log(`\n${checked} facts checked, ${failed} disagreeing with the documents.`);
if (failed > 0) {
	console.log(
		'Each one needs a person to look: a reissued document is as likely as a wrong entry.'
	);
}
process.exit(failed > 0 ? 1 : 0);
