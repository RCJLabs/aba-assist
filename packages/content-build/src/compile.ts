import { createHash } from 'node:crypto';
import { join } from 'node:path';
import MiniSearch from 'minisearch';
import {
	ContentOutline,
	Scenario,
	SourceRegistry,
	Term,
	searchOptions,
	type Source,
	type TermIndexEntry
} from '@aba/content-schema';
import { discover, parseMarkdown, parseYamlFile } from './parse.js';
import type { CompileOptions, CompileResult, EmittedAsset, Issue } from './types.js';
import { error } from './types.js';
import {
	checkDuplicateProse,
	checkPlainLanguage,
	checkReviewStatus,
	checkRights,
	checkSchema,
	checkScenarioSafety
} from './validate.js';

function sha256(s: string): string {
	return createHash('sha256').update(s).digest('hex');
}

/** Prose fields that the rights and safety lexicons are run over. */
function termProse(t: z_Term): string[] {
	return [
		t.definition.technical,
		t.definition.plain,
		t.definition.gloss,
		...t.examples.map((e) => e.text),
		...t.nonExamples.map((e) => e.text)
	];
}

type z_Term = ReturnType<typeof Term.parse>;
type z_Scenario = ReturnType<typeof Scenario.parse>;

function scenarioProse(s: z_Scenario): string[] {
	const base = [s.title, s.situation];
	if (s.kind === 'guidance') {
		return [
			...base,
			...s.steps.flatMap((x) => [x.text, x.rationale ?? '']),
			...s.whatNotToDo,
			...s.whenToEscalate
		];
	}
	return [
		...base,
		s.escalation.immediateSafetyNote,
		s.escalation.mandatedReporterNote ?? '',
		s.escalation.legalNote,
		...s.escalation.documentation
	];
}

export async function compile(opts: CompileOptions): Promise<CompileResult> {
	const { root, channel } = opts;
	const issues: Issue[] = [];
	const push = (...i: Issue[]) => issues.push(...i);

	const inputHash = createHash('sha256');

	// ---------------------------------------------------------------- sources
	const sources = new Map<string, Source>();
	{
		const path = join(root, '_registry', 'sources.yaml');
		const { data, issues: pIssues } = await parseYamlFile(root, path);
		push(...pIssues);
		if (data !== undefined) {
			inputHash.update(JSON.stringify(data));
			const { value, issues: sIssues } = checkSchema(
				SourceRegistry,
				data,
				'_registry/sources.yaml',
				'schema/sources'
			);
			push(...sIssues);
			for (const s of value?.sources ?? []) sources.set(s.id, s);
		} else if (pIssues.length === 0) {
			push(error('parse/missing', 'content/_registry/sources.yaml not found'));
		}
	}

	// --------------------------------------------------------------- taxonomy
	const outlines = new Map<string, ReturnType<typeof ContentOutline.parse>>();
	/** "RBT:C-3" -> true */
	const taskCodes = new Set<string>();
	{
		const dir = join(root, 'taxonomy');
		for (const path of await discover(dir, ['.yaml', '.yml'])) {
			const { data, issues: pIssues } = await parseYamlFile(root, path);
			push(...pIssues);
			if (data === undefined) continue;
			inputHash.update(JSON.stringify(data));
			const file = path.slice(root.length + 1);
			const { value, issues: sIssues } = checkSchema(
				ContentOutline,
				data,
				file,
				'schema/taxonomy'
			);
			push(...sIssues);
			if (!value) continue;
			outlines.set(value.id, value);
			for (const d of value.domains) {
				for (const t of d.tasks) taskCodes.add(`${value.credential}:${t.code}`);
			}
		}
	}

	// ------------------------------------------------------------------ terms
	const terms: z_Term[] = [];
	const termFiles = new Map<string, string>();
	{
		const dir = join(root, 'terms');
		for (const path of await discover(dir, ['.md'])) {
			const { parsed, issues: pIssues } = await parseMarkdown(root, dir, path);
			push(...pIssues);
			if (!parsed) continue;
			inputHash.update(JSON.stringify(parsed.data));

			const { value, issues: sIssues } = checkSchema(
				Term,
				parsed.data,
				parsed.file,
				'schema/term'
			);
			push(...sIssues);
			if (!value) continue;

			if (value.id !== parsed.basename) {
				push(
					error(
						'structure/id-filename-mismatch',
						`id "${value.id}" does not match filename "${parsed.basename}"`,
						parsed.file
					)
				);
			}
			const dirCategory = parsed.dirs[0];
			if (dirCategory && dirCategory !== value.category) {
				push(
					error(
						'structure/category-directory-mismatch',
						`category "${value.category}" but the file lives in terms/${dirCategory}/`,
						parsed.file
					)
				);
			}
			if (termFiles.has(value.id)) {
				push(
					error(
						'structure/duplicate-id',
						`duplicate term id "${value.id}" (also in ${termFiles.get(value.id)})`,
						parsed.file
					)
				);
			}

			termFiles.set(value.id, parsed.file);
			terms.push(value);

			push(...checkRights(value, termProse(value), sources, parsed.file));
			push(...checkReviewStatus(value.review, channel, parsed.file));
			push(...checkPlainLanguage(value.definition.plain, 'definition.plain', parsed.file));
		}
	}

	// -------------------------------------------------------------- scenarios
	const scenarios: z_Scenario[] = [];
	const scenarioFiles = new Map<string, string>();
	{
		const dir = join(root, 'scenarios');
		for (const path of await discover(dir, ['.md'])) {
			const { parsed, issues: pIssues } = await parseMarkdown(root, dir, path);
			push(...pIssues);
			if (!parsed) continue;
			inputHash.update(JSON.stringify(parsed.data));

			const { value, issues: sIssues } = checkSchema(
				Scenario,
				parsed.data,
				parsed.file,
				'schema/scenario'
			);
			push(...sIssues);
			if (!value) continue;

			if (value.id !== parsed.basename) {
				push(
					error(
						'structure/id-filename-mismatch',
						`id "${value.id}" does not match filename "${parsed.basename}"`,
						parsed.file
					)
				);
			}
			if (scenarioFiles.has(value.id)) {
				push(
					error('structure/duplicate-id', `duplicate scenario id "${value.id}"`, parsed.file)
				);
			}
			scenarioFiles.set(value.id, parsed.file);
			scenarios.push(value);

			const prose = scenarioProse(value);
			push(...checkRights(value, prose, sources, parsed.file));
			push(
				...checkScenarioSafety(value as unknown as Record<string, unknown>, prose, parsed.file)
			);
			push(...checkReviewStatus(value.review, channel, parsed.file));
		}
	}

	// ------------------------------------------------- referential integrity
	{
		const termIds = new Set(terms.map((t) => t.id));
		const scenarioIds = new Set(scenarios.map((s) => s.id));
		const retired = new Set(
			[...terms, ...scenarios].filter((x) => x.review.status === 'retired').map((x) => x.id)
		);

		const checkRefs = (
			ids: string[],
			pool: Set<string>,
			kind: string,
			file: string,
			field: string
		) => {
			for (const id of ids) {
				if (!pool.has(id)) {
					push(error('refs/unresolved', `${field} points at unknown ${kind} "${id}"`, file));
				} else if (retired.has(id)) {
					push(error('refs/retired', `${field} points at retired item "${id}"`, file));
				}
			}
		};

		for (const t of terms) {
			const file = termFiles.get(t.id)!;
			checkRefs(t.seeAlso, termIds, 'term', file, 'seeAlso');
			checkRefs(t.contrastWith, termIds, 'term', file, 'contrastWith');
			for (const c of t.citations) {
				if (!sources.has(c.sourceId)) {
					push(error('refs/unknown-source', `cites unknown source "${c.sourceId}"`, file));
				}
			}
			for (const r of t.taskRefs) {
				if (taskCodes.size > 0 && !taskCodes.has(`${r.credential}:${r.code}`)) {
					push(
						error(
							'refs/unknown-task-code',
							`taskRef ${r.credential} ${r.code} is not in the taxonomy`,
							file
						)
					);
				}
			}
			// contrastWith must be symmetric — a one-way "commonly confused with" is a bug.
			for (const other of t.contrastWith) {
				const o = terms.find((x) => x.id === other);
				if (o && !o.contrastWith.includes(t.id)) {
					push(
						error(
							'refs/asymmetric-contrast',
							`"${t.id}" lists contrastWith "${other}" but "${other}" does not list it back`,
							file
						)
					);
				}
			}
		}

		for (const s of scenarios) {
			const file = scenarioFiles.get(s.id)!;
			checkRefs(s.termRefs, termIds, 'term', file, 'termRefs');
			for (const c of s.citations) {
				if (!sources.has(c.sourceId)) {
					push(error('refs/unknown-source', `cites unknown source "${c.sourceId}"`, file));
				}
			}
			for (const r of s.taskRefs) {
				if (taskCodes.size > 0 && !taskCodes.has(`${r.credential}:${r.code}`)) {
					push(
						error(
							'refs/unknown-task-code',
							`taskRef ${r.credential} ${r.code} is not in the taxonomy`,
							file
						)
					);
				}
			}
		}

		void scenarioIds;
	}

	push(
		...checkDuplicateProse(
			terms.map((t) => ({
				id: t.id,
				text: t.definition.technical,
				file: termFiles.get(t.id)!
			}))
		)
	);

	// ----------------------------------------------------------------- emit
	const errors = issues.filter((i) => i.severity === 'error');
	const warnings = issues.filter((i) => i.severity === 'warning');
	const contentVersion = inputHash.digest('hex').slice(0, 12);

	const counts = {
		terms: terms.length,
		scenarios: scenarios.length,
		sources: sources.size,
		outlines: outlines.size
	};

	if (errors.length > 0 || opts.emit === false) {
		return {
			ok: errors.length === 0,
			channel,
			contentVersion,
			errors,
			warnings,
			counts,
			assets: []
		};
	}

	const assets = buildAssets(terms, scenarios, [...outlines.values()], contentVersion);

	return { ok: true, channel, contentVersion, errors, warnings, counts, assets };
}

function buildAssets(
	terms: z_Term[],
	scenarios: z_Scenario[],
	outlines: ReturnType<typeof ContentOutline.parse>[],
	contentVersion: string
): EmittedAsset[] {
	const assets: EmittedAsset[] = [];
	const base = `data/${contentVersion}`;

	const index: TermIndexEntry[] = terms.map((t) => ({
		i: t.id,
		t: t.term,
		a: t.aliases,
		c: t.category,
		g: t.definition.gloss,
		b: t.searchBoost
	}));
	assets.push({
		name: 'terms.index',
		fileName: `${base}/terms.index.json`,
		source: JSON.stringify(index),
		fetchedAtRuntime: false
	});

	// Category buckets: one representation serves both client-side navigation and the
	// offline precache, and sibling terms in a category are exactly what a reader opens
	// next — so bucket locality is a cache win rather than waste.
	const byCategory = new Map<string, z_Term[]>();
	for (const t of terms) {
		const list = byCategory.get(t.category) ?? [];
		list.push(t);
		byCategory.set(t.category, list);
	}
	for (const [category, list] of [...byCategory].sort((a, b) => a[0].localeCompare(b[0]))) {
		const record = Object.fromEntries(list.map((t) => [t.id, t]));
		assets.push({
			name: `terms.${category}`,
			fileName: `${base}/terms.${category}.json`,
			source: JSON.stringify(record),
			fetchedAtRuntime: false
		});
	}

	assets.push({
		name: 'scenarios',
		fileName: `${base}/scenarios.json`,
		source: JSON.stringify(Object.fromEntries(scenarios.map((s) => [s.id, s]))),
		fetchedAtRuntime: false
	});

	assets.push({
		name: 'taxonomy',
		fileName: `${base}/taxonomy.json`,
		source: JSON.stringify(Object.fromEntries(outlines.map((o) => [o.id, o]))),
		fetchedAtRuntime: false
	});

	// Prebuild the search index so the client never pays indexing cost at startup.
	const mini = new MiniSearch(searchOptions());
	mini.addAll(
		terms.map((t) => ({
			i: t.id,
			t: t.term,
			c: t.category,
			g: t.definition.gloss,
			aliases: t.aliases.join(' '),
			technical: t.definition.technical,
			plain: t.definition.plain
		}))
	);
	assets.push({
		name: 'search-index',
		fileName: `${base}/search-index.json`,
		source: JSON.stringify(mini),
		fetchedAtRuntime: false
	});

	const manifest = {
		contentVersion,
		builtAt: new Date().toISOString(),
		assets: Object.fromEntries(
			assets.map((a) => [
				a.name,
				{
					url: `/${a.fileName}`,
					sha256: sha256(a.source),
					bytes: Buffer.byteLength(a.source),
					fetchedAtRuntime: a.fetchedAtRuntime
				}
			])
		)
	};
	assets.push({
		name: 'manifest',
		fileName: `${base}/manifest.json`,
		source: JSON.stringify(manifest, null, 2),
		fetchedAtRuntime: false
	});

	return assets;
}
