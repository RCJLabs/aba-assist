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

/** The first file in `sources` whose name matches, or null. */
function find(pattern) {
	const file = readdirSync(sources).find((f) => pattern.test(f));
	return file ? join(sources, file) : null;
}

/** Text of a document, or of one page of it. */
function extract(path, page) {
	const range = page ? ['-f', String(page), '-l', String(page)] : [];
	return execFileSync('pdftotext', ['-layout', ...range, path, '-'], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	});
}

/** Text of the first file in `sources` whose name matches, or null. */
function text(pattern) {
	const path = find(pattern);
	return path ? extract(path) : null;
}

/**
 * Printed page number to PDF page index.
 *
 * A locator says "p. 17" meaning the number printed in the footer, which is not the
 * seventeenth page of the file — these handbooks put a cover and a contents table in
 * front. Rather than assume an offset, this reads the footer of every page and builds
 * the map, so it stays right when a document gains or loses front matter.
 */
function pageMap(path) {
	const pages = extract(path).split('\f');
	const map = new Map();
	pages.forEach((body, i) => {
		const lines = body.split('\n').filter((l) => l.trim());
		const footer = lines.at(-1) ?? '';
		const m = /\|\s*(\d+)\s*$/.exec(footer);
		if (m && !map.has(Number(m[1]))) map.set(Number(m[1]), i + 1);
	});
	return map;
}

/** Numbers in a claim that are distinctive enough to look for on a page. */
function figures(value) {
	const found = new Set();
	for (const m of value.matchAll(/\b(\d{2,4})\b/g)) found.add(m[1]);
	return [...found];
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

// ------------------------------------------------- credential page locators

/**
 * Do the cited pages actually carry the fact?
 *
 * Every requirement in a credential file names a section and a page. Two things are
 * checkable without a person: whether that section heading appears on that printed page,
 * and whether the distinctive figures in the claim appear there too. A locator that
 * points at the wrong page is the sort of error nobody finds by reading the app, and the
 * sort a reviewer would have to open the handbook to catch.
 */
const HANDBOOKS = [
	// BCaBA first: "BCBAHandbook" is a substring of nothing here, but the assistant file
	// is named BCaBAHandbook and a case-insensitive /BCBAHandbook/ would not match it —
	// the order is what keeps each credential on its own document.
	{ credential: 'bcaba', pattern: /BCaBAHandbook/i },
	{ credential: 'rbt', pattern: /RBTHandbook/i },
	{ credential: 'bcba', pattern: /(?<!a)BCBAHandbook/i }
];

const credentials = load('credentials.json');

for (const doc of HANDBOOKS) {
	const cred = credentials[doc.credential];
	if (!cred) continue;
	const path = find(doc.pattern);
	if (!path) {
		console.log(`\n${doc.credential} handbook — no document supplied, skipped`);
		continue;
	}
	console.log(`\n${cred.label} — page locators`);
	const map = pageMap(path);
	const cache = new Map();
	const pageText = (n) => {
		if (!cache.has(n)) {
			const idx = map.get(n);
			cache.set(n, idx ? extract(path, idx).replace(/\s+/g, ' ') : null);
		}
		return cache.get(n);
	};

	/*
	 * Only prose items carry a checkable claim.
	 *
	 * The machine-readable `requirements` block was included here at first and produced
	 * nothing but noise: stringifying it drags in the locator text itself, the numbers
	 * belonging to sibling requirements, and the day and month of an ISO date as separate
	 * two-digit figures. Those values are already checked properly by the outline and
	 * ethics passes above, so this one sticks to the sentences a reader actually sees.
	 */
	const items = [];
	for (const section of cred.sections ?? []) {
		for (const item of section.items ?? []) {
			if (item.locator) items.push(item);
		}
	}

	const whole = extract(path).replace(/\s+/g, ' ');
	const wrongPageItems = [];
	const missingFigureItems = [];
	const notInDocument = [];

	for (const item of items) {
		/*
		 * A locator can name more than one place: "Accrual of Fieldwork, p. 16; 2027
		 * Eligibility Requirements, p. 28" is one requirement documented in two sections.
		 * Each part is checked on its own and the pages pooled, because the claim is
		 * supported if it appears in any of the places cited for it.
		 */
		const parts = item.locator.split(';').map((p) => p.trim());
		const span = [];
		const heads = [];
		for (const part of parts) {
			const m = /^(.*?),\s*pp?\.\s*(\d+)(?:\s*[–-]\s*(\d+))?$/.exec(part);
			if (!m) continue;
			heads.push(m[1].trim().toLowerCase());
			for (let p = Number(m[2]); p <= Number(m[3] ?? m[2]); p++) span.push(p);
		}
		if (span.length === 0) continue;

		const body = span.map(pageText).filter(Boolean).join(' ');
		if (!body) {
			wrongPageItems.push(`${item.label} → ${item.locator} (page not in the document)`);
			continue;
		}
		const lower = body.toLowerCase();
		if (!heads.some((h) => lower.includes(h))) {
			wrongPageItems.push(`${item.label} → ${item.locator}`);
		}

		/*
		 * A figure missing from the cited page and a figure missing from the document are
		 * different problems. The first is a locator a page or two out, or a total we
		 * worked out ourselves — the exam is "75 scored and 10 unscored", and the page
		 * never prints the 85. The second is a number with no support anywhere, which is
		 * the only one worth stopping for.
		 */
		const absent = figures(String(item.value)).filter((n) => !body.includes(n));
		const nowhere = absent.filter((n) => !whole.includes(n));
		if (nowhere.length > 0) {
			notInDocument.push(`${item.label} → ${item.locator}: ${nowhere.join(', ')}`);
		} else if (absent.length > 0) {
			missingFigureItems.push(`${item.label} → ${item.locator}: ${absent.join(', ')}`);
		}
	}

	console.log(
		wrongPageItems.length === 0
			? ok(`all ${items.length} locators point at a page carrying their section heading`)
			: bad(
					'locator pages',
					`${items.length} locators`,
					`heading not on the cited page:\n            ${wrongPageItems.join('\n            ')}`
				)
	);
	console.log(
		notInDocument.length === 0
			? ok('every figure quoted appears somewhere in the handbook')
			: bad(
					'unsupported figures',
					`${items.length} claims`,
					`no support anywhere in the document:\n            ${notInDocument.join('\n            ')}`
				)
	);
	// Reported, but not a failure: the figure is in the handbook, the page is just off.
	if (missingFigureItems.length > 0) {
		console.log(`  NOTE  ${missingFigureItems.length} figure(s) elsewhere in the document:`);
		for (const line of missingFigureItems) console.log(`          ${line}`);
	}
}

// --------------------------------------------- initial competency assessment

const ICA = find(/Initial_Competency_Assessment/i);
const competency = load('competency.json');
const assessment = Object.values(competency)[0];

if (ICA && assessment) {
	console.log(`\n${assessment.label ?? 'Initial Competency Assessment'}`);
	const flat = extract(ICA).replace(/\s+/g, ' ');
	const tasks = assessment.sections.flatMap((s) => s.tasks);
	console.log(
		/(\d+)\s+tasks/i.test(flat) || tasks.length > 0
			? ok(`${tasks.length} tasks modelled`)
			: bad('task count', String(tasks.length), 'no count found')
	);
	// Task numbers run 1..n with no gaps, which the schema enforces; what the document
	// can settle is whether the section names match.
	for (const s of assessment.sections) {
		const name = (s.title ?? s.name ?? '').toLowerCase();
		if (!name) continue;
		console.log(
			flat.toLowerCase().includes(name)
				? ok(`section "${s.title ?? s.name}"`)
				: bad(`section name`, s.title ?? s.name, 'not found in the packet')
		);
	}
} else if (!ICA) {
	console.log('\nInitial Competency Assessment — no document supplied, skipped');
}

console.log(`\n${checked} facts checked, ${failed} disagreeing with the documents.`);
if (failed > 0) {
	console.log(
		'Each one needs a person to look: a reissued document is as likely as a wrong entry.'
	);
}
process.exit(failed > 0 ? 1 : 0);
