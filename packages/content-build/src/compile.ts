import { createHash } from 'node:crypto';
import { join } from 'node:path';
import MiniSearch from 'minisearch';
import {
	ContentOutline,
	CredentialFacts,
	EthicsCode,
	EthicsTopic,
	QuizFile,
	Scenario,
	SourceRegistry,
	Term,
	isDomainRef,
	searchOptions,
	taskRefKey,
	type QuizQuestion,
	type Source,
	type TaskRef,
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
type z_Outline = ReturnType<typeof ContentOutline.parse>;
type z_Credential = ReturnType<typeof CredentialFacts.parse>;
type z_EthicsCode = ReturnType<typeof EthicsCode.parse>;
type z_EthicsTopic = ReturnType<typeof EthicsTopic.parse>;

function topicProse(t: z_EthicsTopic): string[] {
	return [
		t.ourLabel,
		t.gloss,
		t.ourSummary,
		t.plainSummary,
		t.ifYouAreUnsure,
		...t.whatThisLooksLike,
		...t.commonPitfalls
	];
}

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

function questionProse(q: QuizQuestion): string[] {
	return [q.stem, q.explanation, ...q.options.flatMap((o) => [o.text, o.rationale])];
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
	const outlines = new Map<string, z_Outline>();
	/** "RBT:C-3" -> true */
	const taskCodes = new Set<string>();
	/** "RBT:C" -> true */
	const domainKeys = new Set<string>();
	/** Credentials that have an outline at all. */
	const outlinedCredentials = new Set<string>();
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
			outlinedCredentials.add(value.credential);
			for (const d of value.domains) {
				domainKeys.add(`${value.credential}:${d.letter}`);
				for (const t of d.tasks) taskCodes.add(`${value.credential}:${t.code}`);
			}
			if (!sources.has(value.sourceId)) {
				push(
					error(
						'refs/unknown-source',
						`outline cites unknown source "${value.sourceId}"`,
						file
					)
				);
			}
			push(...checkReviewStatus(value.review, channel, file));
		}
		for (const o of outlines.values()) {
			if (o.subsetOf && !outlines.has(o.subsetOf)) {
				push(error('refs/unresolved', `subsetOf points at unknown outline "${o.subsetOf}"`));
			}
		}
	}

	/**
	 * A task ref is valid when its credential has an outline and the code names either a
	 * domain in that outline or a verified task code. A ref to a credential with no
	 * outline is an error rather than silently unvalidated: that is how a typo'd
	 * credential would otherwise slip through.
	 */
	const checkTaskRefs = (refs: TaskRef[], file: string) => {
		for (const r of refs) {
			if (!outlinedCredentials.has(r.credential)) {
				push(
					error(
						'refs/unknown-task-code',
						`taskRef ${r.credential} ${r.code}: no outline is modelled for ${r.credential}`,
						file
					)
				);
				continue;
			}
			const key = taskRefKey(r);
			const ok = isDomainRef(r.code) ? domainKeys.has(key) : taskCodes.has(key);
			if (!ok) {
				push(
					error(
						'refs/unknown-task-code',
						`taskRef ${r.credential} ${r.code} is not in the ${r.credential} outline`,
						file
					)
				);
			}
		}
	};

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

	// -------------------------------------------------------------- questions
	const questions: QuizQuestion[] = [];
	const questionFiles = new Map<string, string>();
	{
		const dir = join(root, 'questions');
		for (const path of await discover(dir, ['.yaml', '.yml'])) {
			const { data, issues: pIssues } = await parseYamlFile(root, path);
			push(...pIssues);
			if (data === undefined) continue;
			inputHash.update(JSON.stringify(data));
			const file = path.slice(root.length + 1);
			const { value, issues: sIssues } = checkSchema(QuizFile, data, file, 'schema/question');
			push(...sIssues);
			if (!value) continue;

			for (const q of value.questions) {
				if (questionFiles.has(q.id)) {
					push(
						error(
							'structure/duplicate-id',
							`duplicate question id "${q.id}" (also in ${questionFiles.get(q.id)})`,
							file
						)
					);
				}
				questionFiles.set(q.id, file);
				questions.push(q);

				push(...checkRights(q, questionProse(q), sources, file));
				push(...checkReviewStatus(q.review, channel, file));
				push(
					...checkScenarioSafety({ kind: 'question' }, questionProse(q), file).filter(
						(i) => i.rule === 'safety/clinical-decision-language'
					)
				);
			}
		}
	}

	// ------------------------------------------------------------ credentials
	const credentials: z_Credential[] = [];
	{
		const dir = join(root, 'credentials');
		for (const path of await discover(dir, ['.yaml', '.yml'])) {
			const { data, issues: pIssues } = await parseYamlFile(root, path);
			push(...pIssues);
			if (data === undefined) continue;
			inputHash.update(JSON.stringify(data));
			const file = path.slice(root.length + 1);
			const { value, issues: sIssues } = checkSchema(
				CredentialFacts,
				data,
				file,
				'schema/credential'
			);
			push(...sIssues);
			if (!value) continue;
			if (credentials.some((c) => c.id === value.id)) {
				push(error('structure/duplicate-id', `duplicate credential id "${value.id}"`, file));
			}
			credentials.push(value);
			if (!sources.has(value.handbookSourceId)) {
				push(
					error(
						'refs/unknown-source',
						`handbookSourceId "${value.handbookSourceId}" is not in the registry`,
						file
					)
				);
			}
			if (value.outlineId && !outlines.has(value.outlineId)) {
				push(
					error(
						'refs/unresolved',
						`outlineId points at unknown outline "${value.outlineId}"`,
						file
					)
				);
			}
			push(...checkReviewStatus(value.review, channel, file));
			const prose = [
				value.ourOverview,
				...value.sections.flatMap((s) => [s.ourNote ?? '', ...s.items.map((i) => i.value)])
			];
			// No citations block here: the handbook itself is the single source, named by id.
			push(...checkRights({}, prose, sources, file));
		}
	}

	// ---------------------------------------------------------------- ethics
	const ethicsCodes: z_EthicsCode[] = [];
	const ethicsTopics: z_EthicsTopic[] = [];
	const topicFiles = new Map<string, string>();
	{
		const dir = join(root, 'ethics', 'codes');
		for (const path of await discover(dir, ['.yaml', '.yml'])) {
			const { data, issues: pIssues } = await parseYamlFile(root, path);
			push(...pIssues);
			if (data === undefined) continue;
			inputHash.update(JSON.stringify(data));
			const file = path.slice(root.length + 1);
			const { value, issues: sIssues } = checkSchema(
				EthicsCode,
				data,
				file,
				'schema/ethics-code'
			);
			push(...sIssues);
			if (!value) continue;
			if (ethicsCodes.some((c) => c.id === value.id)) {
				push(error('structure/duplicate-id', `duplicate ethics code "${value.id}"`, file));
			}
			ethicsCodes.push(value);
			if (!sources.has(value.sourceId)) {
				push(error('refs/unknown-source', `cites unknown source "${value.sourceId}"`, file));
			}
			push(...checkReviewStatus(value.review, channel, file));
			push(
				...checkRights(
					{},
					[
						value.ourOverview,
						...value.corePrinciples.flatMap((x) => [x.ourLabel, x.ourSummary, x.sourceNote]),
						...value.sections.flatMap((x) => [x.ourLabel, x.ourSummary])
					],
					sources,
					file
				)
			);
		}

		const topicDir = join(root, 'ethics', 'topics');
		for (const path of await discover(topicDir, ['.md'])) {
			const { parsed, issues: pIssues } = await parseMarkdown(root, topicDir, path);
			push(...pIssues);
			if (!parsed) continue;
			inputHash.update(JSON.stringify(parsed.data));
			const { value, issues: sIssues } = checkSchema(
				EthicsTopic,
				parsed.data,
				parsed.file,
				'schema/ethics-topic'
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
			if (topicFiles.has(value.id)) {
				push(
					error('structure/duplicate-id', `duplicate ethics topic "${value.id}"`, parsed.file)
				);
			}
			topicFiles.set(value.id, parsed.file);
			ethicsTopics.push(value);
			push(...checkRights(value, topicProse(value), sources, parsed.file));
			push(...checkReviewStatus(value.review, channel, parsed.file));
			push(...checkPlainLanguage(value.plainSummary, 'plainSummary', parsed.file));
			push(
				...checkScenarioSafety(
					{ kind: 'ethics-topic' },
					topicProse(value),
					parsed.file
				).filter((i) => i.rule === 'safety/clinical-decision-language')
			);
		}

		// A topic must sit under a section that exists, and may only cite a standard number
		// once someone has checked that code's numbering against the document itself.
		const codesById = new Map(ethicsCodes.map((c) => [c.id, c]));
		for (const t of ethicsTopics) {
			const file = topicFiles.get(t.id)!;
			for (const ref of t.sectionRefs) {
				const code = codesById.get(ref.codeId);
				if (!code) {
					push(
						error('refs/unresolved', `sectionRef points at unknown code "${ref.codeId}"`, file)
					);
					continue;
				}
				if (!code.sections.some((s) => s.number === ref.section)) {
					push(
						error('refs/unresolved', `${ref.codeId} has no section "${ref.section}"`, file)
					);
				}
				if (ref.standardNumbers.length > 0 && !code.standardsVerified) {
					push(
						error(
							'refs/unverified-standard',
							`cites standard ${ref.standardNumbers.join(', ')} of ${ref.codeId}, but that code's standard numbers have not been verified against the document. Set standardsVerified once someone has checked them, or drop the numbers and link to the section.`,
							file
						)
					);
				}
				for (const n of ref.standardNumbers) {
					if (!n.startsWith(ref.section + '.')) {
						push(
							error(
								'refs/unresolved',
								`standard ${n} does not belong to section ${ref.section}`,
								file
							)
						);
					}
				}
			}
			// Every credential a topic claims to apply to must be one its code binds.
			const bound = new Set(
				t.sectionRefs.flatMap((r) => codesById.get(r.codeId)?.appliesTo ?? [])
			);
			for (const cred of t.appliesTo) {
				if (bound.size > 0 && !bound.has(cred)) {
					push(
						error(
							'refs/unresolved',
							`topic applies to ${cred}, but none of its codes bind ${cred}`,
							file
						)
					);
				}
			}
		}
	}

	// ------------------------------------------------- referential integrity
	{
		const termIds = new Set(terms.map((t) => t.id));
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
			checkTaskRefs(t.taskRefs, file);
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
			checkTaskRefs(s.taskRefs, file);
		}

		for (const q of questions) {
			const file = questionFiles.get(q.id)!;
			checkRefs(q.termRefs, termIds, 'term', file, 'termRefs');
			for (const c of q.citations) {
				if (!sources.has(c.sourceId)) {
					push(error('refs/unknown-source', `cites unknown source "${c.sourceId}"`, file));
				}
			}
			checkTaskRefs([q.taskRef, ...q.secondaryTaskRefs], file);
		}

		const topicIds = new Set(ethicsTopics.map((t) => t.id));
		const scenarioIdSet = new Set(scenarios.map((x) => x.id));
		for (const t of ethicsTopics) {
			const file = topicFiles.get(t.id)!;
			checkRefs(t.termRefs, termIds, 'term', file, 'termRefs');
			checkRefs(t.scenarioRefs, scenarioIdSet, 'scenario', file, 'scenarioRefs');
			checkRefs(t.relatedTopics, topicIds, 'ethics topic', file, 'relatedTopics');
			for (const c of t.citations) {
				if (!sources.has(c.sourceId)) {
					push(error('refs/unknown-source', `cites unknown source "${c.sourceId}"`, file));
				}
			}
			checkTaskRefs(t.taskRefs, file);
			if (t.relatedTopics.includes(t.id)) {
				push(error('refs/unresolved', `"${t.id}" lists itself as a related topic`, file));
			}
		}

		// Outline tasks point at terms too, so the exam page can link each task to its
		// vocabulary. Dangling links there would be invisible until someone tapped one.
		for (const o of outlines.values()) {
			for (const d of o.domains) {
				for (const t of d.tasks) {
					checkRefs(
						t.termRefs,
						termIds,
						'term',
						`taxonomy/${o.id}.yaml`,
						`${t.code}.termRefs`
					);
				}
			}
		}
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

	/*
	 * `unreviewed` is surfaced to the app, which uses it to decide whether the whole site
	 * is still a preview: it drives the site-wide review banner and tells robots.txt to
	 * keep search engines away. Unreviewed clinical content should not be discoverable by
	 * someone searching for an ABA term, even while the author is reviewing it on a phone.
	 */
	const unreviewed = [
		...terms,
		...scenarios,
		...questions,
		...credentials,
		...ethicsCodes,
		...ethicsTopics
	].filter((x) => x.review.status !== 'approved').length;

	const counts = {
		terms: terms.length,
		scenarios: scenarios.length,
		questions: questions.length,
		sources: sources.size,
		outlines: outlines.size,
		credentials: credentials.length,
		ethicsTopics: ethicsTopics.length,
		unreviewed
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

	const assets = buildAssets(
		terms,
		scenarios,
		questions,
		[...outlines.values()],
		credentials,
		ethicsCodes,
		ethicsTopics,
		contentVersion
	);

	return { ok: true, channel, contentVersion, errors, warnings, counts, assets };
}

function buildAssets(
	terms: z_Term[],
	scenarios: z_Scenario[],
	questions: QuizQuestion[],
	outlines: z_Outline[],
	credentials: z_Credential[],
	ethicsCodes: z_EthicsCode[],
	ethicsTopics: z_EthicsTopic[],
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
		b: t.searchBoost,
		r: t.taskRefs.map(taskRefKey),
		f: t.flashcard.enabled
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

	// One bucket per exam: a candidate studying for one credential never downloads the
	// other bank, and the quiz loads a bucket only when a session starts.
	const byCredential = new Map<string, QuizQuestion[]>();
	for (const q of questions) {
		const list = byCredential.get(q.credential) ?? [];
		list.push(q);
		byCredential.set(q.credential, list);
	}
	for (const [credential, list] of [...byCredential].sort((a, b) =>
		a[0].localeCompare(b[0])
	)) {
		assets.push({
			name: `questions.${credential}`,
			fileName: `${base}/questions.${credential}.json`,
			source: JSON.stringify(list),
			fetchedAtRuntime: false
		});
	}

	assets.push({
		name: 'taxonomy',
		fileName: `${base}/taxonomy.json`,
		source: JSON.stringify(Object.fromEntries(outlines.map((o) => [o.id, o]))),
		fetchedAtRuntime: false
	});

	assets.push({
		name: 'credentials',
		fileName: `${base}/credentials.json`,
		source: JSON.stringify(Object.fromEntries(credentials.map((c) => [c.id, c]))),
		fetchedAtRuntime: false
	});

	assets.push({
		name: 'ethics-codes',
		fileName: `${base}/ethics-codes.json`,
		source: JSON.stringify(Object.fromEntries(ethicsCodes.map((c) => [c.id, c]))),
		fetchedAtRuntime: false
	});

	// Topics ship as one bundle rather than per-topic chunks: the whole reference is a
	// few dozen kilobytes, and someone reading one ethics topic usually reads the next.
	assets.push({
		name: 'ethics-topics',
		fileName: `${base}/ethics-topics.json`,
		source: JSON.stringify(Object.fromEntries(ethicsTopics.map((t) => [t.id, t]))),
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
